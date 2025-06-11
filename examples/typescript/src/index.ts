const baudrates = document.getElementById("baudrates") as HTMLSelectElement;
const consoleBaudrates = document.getElementById("consoleBaudrates") as HTMLSelectElement;
const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
const traceButton = document.getElementById("copyTraceButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const consoleStartButton = document.getElementById("consoleStartButton") as HTMLButtonElement;
const consoleStopButton = document.getElementById("consoleStopButton") as HTMLButtonElement;
const eraseButton = document.getElementById("eraseButton") as HTMLButtonElement;
const addFileButton = document.getElementById("addFile") as HTMLButtonElement;
const programButton = document.getElementById("programButton");
const zipFileInput = document.getElementById("zipFileInput") as HTMLInputElement;
const filesDiv = document.getElementById("files");
const terminal = document.getElementById("terminal");
const programDiv = document.getElementById("program");
const consoleDiv = document.getElementById("console");
const lblBaudrate = document.getElementById("lblBaudrate");
const lblConsoleBaudrate = document.getElementById("lblConsoleBaudrate");
const lblConsoleFor = document.getElementById("lblConsoleFor");
const lblConnTo = document.getElementById("lblConnTo");
const table = document.getElementById("fileTable") as HTMLTableElement;
const alertDiv = document.getElementById("alertDiv");

const debugLogging = document.getElementById("debugLogging") as HTMLInputElement;

// This is a frontend example of Esptool-JS using local bundle file
// To optimize use a CDN hosted version like
// https://unpkg.com/esptool-js@0.5.0/bundle.js
import { ESPLoader, FlashOptions, LoaderOptions, Transport } from "../../../lib";
import { serial } from "web-serial-polyfill";

const serialLib = !navigator.serial && navigator.usb ? serial : navigator.serial;

declare let Terminal; // Terminal is imported in HTML script
declare let CryptoJS; // CryptoJS is imported in HTML script
declare let JSZip; // JSZip is imported in HTML script

const term = new Terminal({ cols: 120, rows: 40 });
term.open(terminal);

let device = null;
let transport: Transport;
let chip: string = null;
let esploader: ESPLoader;

disconnectButton.style.display = "none";
traceButton.style.display = "none";
eraseButton.style.display = "none";
consoleStopButton.style.display = "none";
resetButton.style.display = "none";
filesDiv.style.display = "none";

/**
 * The built in Event object.
 * @external Event
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Event}
 */

/**
 * File reader handler to read given local file.
 * @param {Event} evt File Select event
 */
function handleFileSelect(evt) {
  const file = evt.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = (ev: ProgressEvent<FileReader>) => {
    evt.target.data = ev.target.result;
  };

  reader.readAsBinaryString(file);
}

/**
 * Parse chislink-fw format ZIP file and extract flasher_args.json and bin files
 * @param {File} zipFile ZIP file to parse
 */
async function parseChislinkFirmwareZip(zipFile: File) {
  try {
    const arrayBuffer = await zipFile.arrayBuffer();
    const zip = new JSZip();
    const contents = await zip.loadAsync(arrayBuffer);
    
    // Clear existing table rows except header
    while (table.rows.length > 1) {
      table.deleteRow(1);
    }
    
    // Look for flasher_args.json
    const flasherArgsFile = contents.file("flasher_args.json");
    if (!flasherArgsFile) {
      throw new Error("未找到 flasher_args.json 文件，这不是一个有效的 chislink-fw 格式文件");
    }
    
    // Parse flasher_args.json
    const flasherArgsContent = await flasherArgsFile.async("string");
    const flasherArgs = JSON.parse(flasherArgsContent);
    
    if (!flasherArgs.flash_files) {
      throw new Error("flasher_args.json 中未找到 flash_files 配置");
    }
    
    // Extract and add files based on flash_files configuration
    for (const [address, filename] of Object.entries(flasherArgs.flash_files)) {
      const binFile = contents.file(filename as string);
      if (!binFile) {
        console.warn(`警告: 未找到文件 ${filename}`);
        continue;
      }
      
      // Get binary data as Uint8Array first, then convert to binary string
      const uint8Array = await binFile.async("uint8array");
      const binaryData = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
      
      // Add row to table
      const rowCount = table.rows.length;
      const row = table.insertRow(rowCount);
      
      // Column 1 - Offset
      const cell1 = row.insertCell(0);
      const element1 = document.createElement("input");
      element1.type = "text";
      element1.id = "offset" + rowCount;
      element1.value = address;
      element1.readOnly = true;
      cell1.appendChild(element1);
      
      // Column 2 - File name (display only)
      const cell2 = row.insertCell(1);
      const fileDisplay = document.createElement("span");
      fileDisplay.textContent = filename as string;
      fileDisplay.style.color = "#007bff";
      fileDisplay.style.fontWeight = "bold";
      cell2.appendChild(fileDisplay);
      
      // Store binary data for programming
      const hiddenInput = document.createElement("input") as any;
      hiddenInput.type = "hidden";
      hiddenInput.data = binaryData;
      cell2.appendChild(hiddenInput);
      
      // Column 3 - Progress
      const cell3 = row.insertCell(2);
      cell3.classList.add("progress-cell");
      cell3.style.display = "none";
      cell3.innerHTML = `<progress value="0" max="100"></progress>`;
      
      // Column 4 - Remove File
      const cell4 = row.insertCell(3);
      cell4.classList.add("action-cell");
      const element4 = document.createElement("input");
      element4.type = "button";
      element4.setAttribute("class", "btn btn-sm btn-warning");
      element4.setAttribute("value", "移除");
      element4.onclick = function () {
        removeRow(row);
      };
      cell4.appendChild(element4);
    }
    
    // Show success message
    const alertMsg = document.getElementById("alertmsg");
    alertMsg.innerHTML = `<strong>🧀 ChisLink ZIP解析成功！</strong><br>发现 ${Object.keys(flasherArgs.flash_files).length} 个固件文件，准备开始美味的烧录过程！`;
    alertDiv.style.display = "block";
    alertDiv.className = "alert alert-success alert-dismissible";
    
    // Auto hide success message after 3 seconds
    setTimeout(() => {
      alertDiv.style.display = "none";
      alertDiv.className = "alert alert-danger alert-dismissible";
    }, 3000);
    
  } catch (error) {
    console.error("解析 ZIP 文件出错:", error);
    const alertMsg = document.getElementById("alertmsg");
    alertMsg.innerHTML = `<strong>🚫 ChisLink ZIP解析失败：</strong>${error.message}`;
    alertDiv.style.display = "block";
  }
}

// Handle ZIP file upload
if (zipFileInput) {
  zipFileInput.onchange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      await parseChislinkFirmwareZip(file);
    }
  };
}

/**
 * Reset the ESP32 device
 */
async function resetDevice() {
  try {
    if (transport) {
      // Perform hardware reset
      await transport.setDTR(false);
      await transport.setRTS(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await transport.setDTR(true);
      await transport.setRTS(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (e) {
    console.warn("Reset failed:", e);
  }
}

/**
 * Start serial monitor after successful programming
 */
async function startSerialMonitor() {
  try {
    // Switch to console mode
    programDiv.style.display = "none";
    consoleDiv.style.display = "initial";
    
    // Update UI
    lblConsoleFor.style.display = "block";
    lblConsoleFor.innerHTML = "Connected to device: " + chip + " (Serial Monitor)";
    lblConsoleBaudrate.style.display = "none";
    consoleBaudrates.style.display = "none";
    consoleStartButton.style.display = "none";
    consoleStopButton.style.display = "initial";
    resetButton.style.display = "initial";
    
    // Check if transport is already connected, if so disconnect first
    if (transport && transport.device && transport.device.readable) {
      await transport.disconnect();
      await transport.waitForUnlock(500);
    }
    
    // Wait a bit before connecting to ensure device is ready
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Connect at 115200 baud (common for ESP32)
    await transport.connect(115200);
    isConsoleClosed = false;
    
    term.writeln("=== 烧录完成，启动串口监控 ===");
    term.writeln("波特率: 115200");
    term.writeln("按 'Stop' 返回烧录界面");
    term.writeln("===========================");
    
    // Start reading serial data
    while (true && !isConsoleClosed) {
      const readLoop = transport.rawRead();
      const { value, done } = await readLoop.next();

      if (done || !value) {
        break;
      }
      term.write(value);
    }
  } catch (e) {
    console.error("串口监控启动失败:", e);
    term.writeln(`Serial Monitor Error: ${e.message}`);
  }
}

const espLoaderTerminal = {
  clean() {
    term.clear();
  },
  writeLine(data) {
    term.writeln(data);
  },
  write(data) {
    term.write(data);
  },
};

connectButton.onclick = async () => {
  try {
    if (device === null) {
      device = await serialLib.requestPort({});
      transport = new Transport(device, true);
    }
    const flashOptions = {
      transport,
      baudrate: parseInt(baudrates.value),
      terminal: espLoaderTerminal,
      debugLogging: debugLogging.checked,
    } as LoaderOptions;
    esploader = new ESPLoader(flashOptions);

    chip = await esploader.main();

    // Temporarily broken
    // await esploader.flashId();
    console.log("Settings done for :" + chip);
    lblBaudrate.style.display = "none";
    lblConnTo.innerHTML = "Connected to device: " + chip;
    lblConnTo.style.display = "block";
    baudrates.style.display = "none";
    connectButton.style.display = "none";
    disconnectButton.style.display = "initial";
    traceButton.style.display = "initial";
    eraseButton.style.display = "initial";
    filesDiv.style.display = "initial";
    consoleDiv.style.display = "none";
    
    // Show connection success message
    term.writeln("=== 🧀 ChisLink 设备连接成功！===");
    term.writeln("已连接到: " + chip);
    term.writeln("请上传ChisLink固件包或手动添加文件进行烧录");
    term.writeln("烧录完成后将自动启动串口监控，享受起司般顺滑的体验！");
    term.writeln("===============================");;
  } catch (e) {
    console.error(e);
    term.writeln(`Error: ${e.message}`);
  }
};

traceButton.onclick = async () => {
  if (transport) {
    transport.returnTrace();
  }
};

resetButton.onclick = async () => {
  if (transport) {
    await transport.setDTR(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await transport.setDTR(true);
  }
};

eraseButton.onclick = async () => {
  eraseButton.disabled = true;
  try {
    await esploader.eraseFlash();
  } catch (e) {
    console.error(e);
    term.writeln(`Error: ${e.message}`);
  } finally {
    eraseButton.disabled = false;
  }
};

addFileButton.onclick = () => {
  const rowCount = table.rows.length;
  const row = table.insertRow(rowCount);

  //Column 1 - Offset
  const cell1 = row.insertCell(0);
  const element1 = document.createElement("input");
  element1.type = "text";
  element1.id = "offset" + rowCount;
  element1.value = "0x1000";
  cell1.appendChild(element1);

  // Column 2 - File selector
  const cell2 = row.insertCell(1);
  const element2 = document.createElement("input");
  element2.type = "file";
  element2.id = "selectFile" + rowCount;
  element2.name = "selected_File" + rowCount;
  element2.addEventListener("change", handleFileSelect, false);
  cell2.appendChild(element2);

  // Column 3  - Progress
  const cell3 = row.insertCell(2);
  cell3.classList.add("progress-cell");
  cell3.style.display = "none";
  cell3.innerHTML = `<progress value="0" max="100"></progress>`;

  // Column 4  - Remove File
  const cell4 = row.insertCell(3);
  cell4.classList.add("action-cell");
  if (rowCount > 1) {
    const element4 = document.createElement("input");
    element4.type = "button";
    const btnName = "button" + rowCount;
    element4.name = btnName;
    element4.setAttribute("class", "btn");
    element4.setAttribute("value", "Remove"); // or element1.value = "button";
    element4.onclick = function () {
      removeRow(row);
    };
    cell4.appendChild(element4);
  }
};

/**
 * The built in HTMLTableRowElement object.
 * @external HTMLTableRowElement
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableRowElement}
 */

/**
 * Remove file row from HTML Table
 * @param {HTMLTableRowElement} row Table row element to remove
 */
function removeRow(row: HTMLTableRowElement) {
  const rowIndex = Array.from(table.rows).indexOf(row);
  table.deleteRow(rowIndex);
}

/**
 * Clean devices variables on chip disconnect. Remove stale references if any.
 */
function cleanUp() {
  device = null;
  transport = null;
  chip = null;
}

disconnectButton.onclick = async () => {
  if (transport) await transport.disconnect();

  term.reset();
  lblBaudrate.style.display = "initial";
  baudrates.style.display = "initial";
  consoleBaudrates.style.display = "initial";
  connectButton.style.display = "initial";
  disconnectButton.style.display = "none";
  traceButton.style.display = "none";
  eraseButton.style.display = "none";
  lblConnTo.style.display = "none";
  filesDiv.style.display = "none";
  alertDiv.style.display = "none";
  consoleDiv.style.display = "initial";
  cleanUp();
};

let isConsoleClosed = false;
consoleStartButton.onclick = async () => {
  if (device === null) {
    device = await serialLib.requestPort({});
    transport = new Transport(device, true);
  }
  lblConsoleFor.style.display = "block";
  lblConsoleBaudrate.style.display = "none";
  consoleBaudrates.style.display = "none";
  consoleStartButton.style.display = "none";
  consoleStopButton.style.display = "initial";
  resetButton.style.display = "initial";
  programDiv.style.display = "none";

  await transport.connect(parseInt(consoleBaudrates.value));
  isConsoleClosed = false;

  while (true && !isConsoleClosed) {
    const readLoop = transport.rawRead();
    const { value, done } = await readLoop.next();

    if (done || !value) {
      break;
    }
    term.write(value);
  }
  console.log("quitting console");
};

consoleStopButton.onclick = async () => {
  isConsoleClosed = true;
  if (transport) {
    await transport.disconnect();
    await transport.waitForUnlock(1500);
  }
  term.reset();
  
  // Check if we were connected to device for flashing
  if (chip && esploader) {
    // Return to programming interface (keep connection)
    lblConsoleBaudrate.style.display = "none";
    consoleBaudrates.style.display = "none";
    consoleStartButton.style.display = "none";
    consoleStopButton.style.display = "none";
    resetButton.style.display = "none";
    lblConsoleFor.style.display = "none";
    programDiv.style.display = "initial";
    consoleDiv.style.display = "none";
    
    // Show the programming interface again
    lblConnTo.style.display = "block";
    disconnectButton.style.display = "initial";
    traceButton.style.display = "initial";
    eraseButton.style.display = "initial";
    filesDiv.style.display = "initial";
  } else {
    // Normal console mode, clean up everything
    lblConsoleBaudrate.style.display = "initial";
    consoleBaudrates.style.display = "initial";
    consoleStartButton.style.display = "initial";
    consoleStopButton.style.display = "none";
    resetButton.style.display = "none";
    lblConsoleFor.style.display = "none";
    programDiv.style.display = "initial";
    cleanUp();
  }
};

/**
 * Validate the provided files images and offset to see if they're valid.
 * @returns {string} Program input validation result
 */
function validateProgramInputs() {
  const offsetArr = [];
  const rowCount = table.rows.length;
  let row;
  let offset = 0;
  let fileData = null;

  // check for mandatory fields
  for (let index = 1; index < rowCount; index++) {
    row = table.rows[index];

    //offset fields checks
    const offSetObj = row.cells[0].childNodes[0];
    offset = parseInt(offSetObj.value);

    // Non-numeric or blank offset
    if (Number.isNaN(offset)) return "Offset field in row " + index + " is not a valid address!";
    // Repeated offset used
    else if (offsetArr.includes(offset)) return "Offset field in row " + index + " is already in use!";
    else offsetArr.push(offset);

    const fileObj = row.cells[1].childNodes[0];
    // Check if it's a regular file input or a hidden input from ZIP
    if (fileObj.tagName === 'INPUT') {
      fileData = (fileObj as any).data;
    } else {
      // It's a span, look for the hidden input
      const hiddenInput = row.cells[1].querySelector('input[type="hidden"]');
      fileData = hiddenInput ? (hiddenInput as any).data : null;
    }
    if (fileData == null) return "No file selected for row " + index + "!";
  }
  return "success";
}

programButton.onclick = async () => {
  const alertMsg = document.getElementById("alertmsg");
  const err = validateProgramInputs();

  if (err != "success") {
    alertMsg.innerHTML = "<strong>" + err + "</strong>";
    alertDiv.style.display = "block";
    return;
  }

  // Hide error message
  alertDiv.style.display = "none";

  const fileArray = [];
  const progressBars = [];

  for (let index = 1; index < table.rows.length; index++) {
    const row = table.rows[index];

    const offSetObj = row.cells[0].childNodes[0] as HTMLInputElement;
    const offset = parseInt(offSetObj.value);

    // Get file data - handle both regular upload and ZIP extracted files
    let fileData: string;
    const firstChild = row.cells[1].childNodes[0];
    if ((firstChild as any).tagName === 'INPUT') {
      fileData = (firstChild as any).data;
    } else {
      // It's a span, look for the hidden input
      const hiddenInput = row.cells[1].querySelector('input[type="hidden"]');
      fileData = hiddenInput ? (hiddenInput as any).data : null;
    }

    const progressBar = row.cells[2].childNodes[0];

    progressBar.textContent = "0";
    progressBars.push(progressBar);

    row.cells[2].style.display = "initial";
    row.cells[3].style.display = "none";

    fileArray.push({ data: fileData, address: offset });
  }

  try {
    const flashOptions: FlashOptions = {
      fileArray: fileArray,
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        progressBars[fileIndex].value = (written / total) * 100;
      },
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
    } as FlashOptions;
    await esploader.writeFlash(flashOptions);
    await esploader.after();
    
    // Show success message
    term.writeln("=== 烧录完成！===");
    term.writeln("正在复位设备并启动串口监控...");
    
    // Reset the device to start running the new firmware
    await resetDevice();
    
    // Wait a bit for the device to restart
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Auto start serial monitor after successful flashing
    setTimeout(async () => {
      await startSerialMonitor();
    }, 500);
    
  } catch (e) {
    console.error(e);
    term.writeln(`Error: ${e.message}`);
  } finally {
    // Hide progress bars and show erase buttons
    for (let index = 1; index < table.rows.length; index++) {
      table.rows[index].cells[2].style.display = "none";
      table.rows[index].cells[3].style.display = "initial";
    }
  }
};

addFileButton.onclick(this);
