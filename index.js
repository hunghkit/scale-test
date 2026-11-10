const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT_NAME = 'COM4'; // Đổi thành cổng COM thực tế của bạn (hoặc /dev/ttyUSB0)

// const PORT_NAME = '/dev/cu.wchusbserial130'; // For macos

const port = new SerialPort({
  path: PORT_NAME,
  baudRate: 9600,
  dataBits: 8,      // Nếu nhận chuỗi rác, thử đổi thành: 7
  parity: 'none',   // Nếu nhận chuỗi rác, thử đổi thành: 'odd'
  stopBits: 1,
});

// Gói tin Magellan 9800i thường kết thúc bằng CR (\r)
const parser = port.pipe(new ReadlineParser({ delimiter: '\r' }));

// 1. Khi mở cổng thành công
port.on('open', () => {
  console.log(`=== ĐÃ KẾT NỐI THÀNH CÔNG VỚI ${PORT_NAME} (9600, 8-N-1) ===`);
  console.log('-> Quét mã vạch: đưa sản phẩm qua kính quét.');
  console.log('-> Đọc cân: nhấn Enter trên bàn phím.');
  console.log('-> Zero cân: gõ "z" rồi nhấn Enter.');
  console.log('------------------------------------------------------------');
});

// 2. console.log toàn bộ dữ liệu nhận về từ máy 9800i
parser.on('data', (raw) => {
  const data = raw.trim();
  if (!data) return;

  console.log('\n--- NHẬN ĐƯỢC GÓI TIN MỚI ---');
  console.log('Dữ liệu dạng Text :', data);
  console.log('Dữ liệu dạng Hex  :', Buffer.from(data).toString('hex'));

  // Kiểm tra phân luồng SCRS-232
  if (data.startsWith('S')) {
    console.log('[LOẠI GÓI TIN]    : CÂN (SCALE)');
    console.log('Mã trạng thái     :', data.substring(1, 3));
    console.log('Khối lượng thô    :', data.substring(3, 8));
    
    // Nếu trạng thái là 11 (cân ổn định)
    if (data.substring(1, 3) === '11') {
      const kg = parseInt(data.substring(3, 8), 10) / 1000;
      console.log('=> KHỐI LƯỢNG THỰC:', kg, 'kg');
    }
  } else {
    console.log('[LOẠI GÓI TIN]    : MÃ VẠCH (BARCODE)');
    console.log('=> MÃ QUÉT ĐƯỢC   :', data);
  }
});

// 3. Nhận phím từ terminal để gửi lệnh thử nghiệm xuống cân
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (input) => {
  const cmd = input.trim().toLowerCase();

  if (cmd === 'z') {
    console.log('>> [GỬI LỆNH] Zero cân (Z\\r)...');
    port.write('Z\r');
  } else {
    console.log('>> [GỬI LỆNH] Đọc cân (W\\r)...');
    port.write('W\r');
  }
});

// Bắt lỗi nếu không mở được cổng
port.on('error', (err) => {
  console.error('LỖI CỔNG COM:', err.message);
});