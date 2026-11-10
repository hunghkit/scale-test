const { SerialPort } = require('serialport');


const PORT_NAME = 'COM4'; // Đổi thành cổng COM thực tế của bạn (hoặc /dev/ttyUSB0)

// const PORT_NAME = '/dev/cu.wchusbserial130'; // For macos
// const PORT_NAME = '/dev/cu.wchusbserial130';

// Khởi tạo cổng kết nối
const port = new SerialPort({
  path: PORT_NAME,
  baudRate: 9600,
  dataBits: 8,      // Thử đổi sang 7 nếu máy quét cài profile NCR
  parity: 'none',   // Thử đổi sang 'odd' nếu máy quét cài profile NCR
  stopBits: 1,
  rtscts: false,    // Điều khiển luồng bằng tay qua DTR/RTS
  autoOpen: false,
});

// ==========================================================
// 1. CÁC HÀM ĐIỀU KHIỂN (LIFECYCLE: CLAIM, ENABLE, RELEASE)
// ==========================================================

// CLAIM: Giành quyền điều khiển độc quyền bằng cách kích hoạt chân phần cứng DTR/RTS
function claimDevice() {
  return new Promise((resolve, reject) => {
    port.set({ dtr: true, rts: true }, (err) => {
      if (err) return reject(err);
      console.log('🔒 [CLAIM] Đã chiếm quyền kết nối phần cứng (DTR/RTS = HIGH)');
      resolve();
    });
  });
}

// ENABLE: Bật cân (Weight) và bật mắt đọc (Scanner)
function enableWeightAndScanner() {
  // 0x11 (DC1): Bật cân (Scale Enable)
  // 0x12 (DC2): Bật mắt đọc (Scanner Enable)
  const enableBuffer = Buffer.from([0x11, 0x12]);
  
  port.write(enableBuffer, (err) => {
    if (err) {
      console.error('❌ [ENABLE] Thất bại:', err.message);
    } else {
      console.log('⚡ [ENABLE] Đã kích hoạt Cân (0x11) & Mắt đọc (0x12)');
    }
  });
}

// READ WEIGHT: Gửi lệnh yêu cầu đọc số cân
function requestWeight() {
  console.log('>> [REQUEST WEIGHT] Đang gửi lệnh "W\\r" (57 0d)...');
  port.write('W\r');
}

// ZERO SCALE: Gửi lệnh đưa bàn cân về 0.000 kg
function zeroScale() {
  console.log('>> [ZERO] Đang gửi lệnh Zero "Z\\r" (5a 0d)...');
  port.write('Z\r');
}

// RELEASE: Khóa thiết bị và nhả quyền khi tắt ứng dụng / thoát ca
function releaseDevice() {
  console.log('\n🛑 [RELEASE] Đang ngắt kết nối và nhả quyền...');
  
  // 0x13 (DC3): Tắt cân
  // 0x14 (DC4): Tắt mắt đọc
  const disableBuffer = Buffer.from([0x13, 0x14]);
  
  port.write(disableBuffer, () => {
    port.set({ dtr: false, rts: false }, () => {
      console.log('🔓 [RELEASE] Đã hạ DTR/RTS = LOW. Đóng cổng.');
      port.close(() => process.exit(0));
    });
  });
}

// ==========================================================
// 2. KHỞI CHẠY KẾT NỐI VÀ TỰ ĐỘNG CLAIM + ENABLE
// ==========================================================

port.open(async (err) => {
  if (err) {
    console.error(`❌ Không thể mở cổng ${PORT_NAME}:`, err.message);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`✅ ĐÃ MỞ CỔNG: ${PORT_NAME} (9600 - 8 - N - 1)`);
  console.log(`======================================================`);

  try {
    // Bước 1: Chiếm quyền thiết bị
    await claimDevice();
    
    // Bước 2: Kích hoạt Cân & Mắt đọc (delay nhẹ 200ms để cân ổn định)
    setTimeout(() => {
      enableWeightAndScanner();
    }, 200);

  } catch (error) {
    console.error('Lỗi khi Claim/Enable:', error.message);
  }

  console.log(`\n👉 HƯỚNG DẪN TEST:`);
  console.log(`   - Quét mã vạch : Đưa sản phẩm qua mắt đọc.`);
  console.log(`   - Nhấn [Enter] : Gửi lệnh đọc cân ("W\\r").`);
  console.log(`   - Nhấn [e]     : Gửi lại lệnh ENABLE Cân & Scanner.`);
  console.log(`   - Nhấn [z]     : Gửi lệnh Zero cân.`);
  console.log(`   - Nhấn [q]     : RELEASE và thoát chương trình.`);
  console.log(`======================================================\n`);
});

// ==========================================================
// 3. XỬ LÝ VÀ PHÂN LUỒNG DỮ LIỆU NHẬN VỀ
// ==========================================================

port.on('data', (buffer) => {
  const hex = buffer.toString('hex');
  const text = buffer.toString('ascii').trim();

  console.log('\n📥 [DỮ LIỆU ĐẾN]');
  console.log('   Raw Hex :', hex);
  console.log('   Raw Text:', text);

  // Phân luồng Single-Cable RS-232:
  // Gói tin cân của Magellan luôn bắt đầu bằng ký tự 'S'
  if (text.startsWith('S')) {
    parseScalePacket(text);
  } else {
    // Nếu không bắt đầu bằng 'S', đây là dữ liệu Barcode
    console.log(`🏷️  [BARCODE] : ${text}`);
  }
});

// Giải mã gói tin cân: S + Status (2 ký tự) + Weight (5 ký tự)
function parseScalePacket(packet) {
  const status = packet.substring(1, 3);
  const rawWeight = packet.substring(3, 8);

  switch (status) {
    case '11': {
      // Trạng thái cân ổn định
      const weightKg = parseInt(rawWeight, 10) / 1000;
      console.log(`⚖️  [CÂN ỔN ĐỊNH] Khối lượng: ${weightKg.toFixed(3)} kg`);
      break;
    }
    case '12':
      console.log(`⚠️  [CÂN DAO ĐỘNG] Cân đang rung lắc, chưa ổn định.`);
      break;
    case '13':
      console.log(`⚠️  [LỖI CÂN] Cân âm bàn (Under zero) -> Hãy gõ 'z' để Zero bàn cân.`);
      break;
    case '14':
      console.log(`⚠️  [LỖI CÂN] Cân quá tải trọng (Over capacity).`);
      break;
    case '15':
      console.log(`⚖️  [CÂN ZERO] Mặt bàn cân đang ở mức chuẩn 0.000 kg.`);
      break;
    default:
      console.log(`ℹ️  [MÃ CÂN KHÁC] Status: ${status}, Data: ${packet}`);
  }
}

// ==========================================================
// 4. BẮT SỰ KIỆN TỪ TERMINAL
// ==========================================================

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (input) => {
  const key = input.trim().toLowerCase();

  if (!port.isOpen) return;

  switch (key) {
    case 'w':
    case '': // Bấm Enter không cũng đọc cân
      requestWeight();
      break;
    case 'e':
      enableWeightAndScanner();
      break;
    case 'z':
      zeroScale();
      break;
    case 'q':
      releaseDevice();
      break;
    default:
      console.log(`Phím '${key}' không hợp lệ. Nhấn Enter (đọc cân), 'z' (zero), 'q' (thoát).`);
  }
});

// Bắt sự kiện Ctrl + C để luôn Release sạch sẽ trước khi tắt
process.on('SIGINT', () => {
  releaseDevice();
});

port.on('error', (err) => {
  console.error('❌ Lỗi cổng Serial:', err.message);
});