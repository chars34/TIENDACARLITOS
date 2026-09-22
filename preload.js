const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    
    // ═══════════════════════════════════════════════════════════
    // 🖨️ IMPRESIÓN DE ETIQUETA
    // ═══════════════════════════════════════════════════════════
   imprimirTicket: (data) => ipcRenderer.invoke('imprimir-ticket', data),
    imprimirEtiqueta: (data) => ipcRenderer.invoke('imprimir-etiqueta', data),

    // ═══════════════════════════════════════════════════════════
    // 🚪 CERRAR APLICACIÓN
    // ═══════════════════════════════════════════════════════════
    cerrarApp: () => ipcRenderer.send('cerrar-app'),

    // ═══════════════════════════════════════════════════════════
    // 📱 WHATSAPP
    // ═══════════════════════════════════════════════════════════
    abrirWhatsApp: (url) => ipcRenderer.send('abrir-whatsapp-externo', url),

    // ═══════════════════════════════════════════════════════════
    // 🔌 SERIAL (Impresoras USB)
    // ═══════════════════════════════════════════════════════════
    onSerialPorts: (callback) => ipcRenderer.on('serial-port-list', (event, ports) => callback(ports)),
    selectSerialPort: (portId) => ipcRenderer.send('serial-port-selected', portId),
    cancelSerialSelection: () => ipcRenderer.send('cancel-serial-selection'),
    refreshSerialSelection: () => ipcRenderer.send('refresh-serial-selection'),
    onTriggerSerialSelector: (callback) => ipcRenderer.on('trigger-serial-selector', () => callback()),

    // ═══════════════════════════════════════════════════════════
    // 🖱️ HID (Escáneres USB)
    // ═══════════════════════════════════════════════════════════
    onHidDeviceList: (callback) => ipcRenderer.on('hid-device-list', (event, devices) => callback(devices)),
    selectHidDevice: (deviceId) => ipcRenderer.send('hid-device-selected', deviceId),
    cancelHidSelection: () => ipcRenderer.send('cancel-hid-selection'),
    refreshHidSelection: () => ipcRenderer.send('refresh-hid-selection'),
    onTriggerHidSelector: (callback) => ipcRenderer.on('trigger-hid-selector', () => callback()),

    // ═══════════════════════════════════════════════════════════
    // 📶 BLUETOOTH
    // ═══════════════════════════════════════════════════════════
    onBluetoothDeviceList: (callback) => ipcRenderer.on('bluetooth-device-list', (event, devices) => callback(devices)),
    selectBluetoothDevice: (deviceId) => ipcRenderer.send('bluetooth-device-selected', deviceId),
    cancelBluetoothSelection: () => ipcRenderer.send('cancel-bluetooth-selection'),
    refreshBluetoothSelection: () => ipcRenderer.send('refresh-bluetooth-selection'),
    onTriggerBluetoothSelector: (callback) => ipcRenderer.on('trigger-bluetooth-selector', () => callback()),

    // ═══════════════════════════════════════════════════════════
    // 🔌 USB GENÉRICO
    // ═══════════════════════════════════════════════════════════
    onUsbDeviceList: (callback) => ipcRenderer.on('usb-device-list', (event, devices) => callback(devices)),
    selectUsbDevice: (deviceId) => ipcRenderer.send('usb-device-selected', deviceId),
    cancelUsbSelection: () => ipcRenderer.send('cancel-usb-selection'),
    refreshUsbSelection: () => ipcRenderer.send('refresh-usb-selection'),
    onTriggerUsbSelector: (callback) => ipcRenderer.on('trigger-usb-selector', () => callback()),

    // ═══════════════════════════════════════════════════════════
    // 🏪 LICENCIA / TIENDA
    // ═══════════════════════════════════════════════════════════
    guardarTiendaId: (tiendaId) => ipcRenderer.invoke('guardar-tienda-id', tiendaId),
      verificarHardware: () => ipcRenderer.invoke("verificar-hardware"),
    vincularHardware: (codigo) => ipcRenderer.invoke("vincular-hardware", codigo),  
  generarCodigoCaja: () => ipcRenderer.invoke('generar-codigo-caja'),
  conectarConCodigo: (codigo) => ipcRenderer.invoke('conectar-con-codigo', codigo)
});