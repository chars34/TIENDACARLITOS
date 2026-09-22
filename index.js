// ═══════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { machineIdSync } = require('node-machine-id');

// ═══════════════════════════════════════════════════════════════
// HABILITAR CARACTERÍSTICAS WEB
// ═══════════════════════════════════════════════════════════════
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-web-bluetooth', 'true');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// ═══════════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════════════════════
let mainWindow = null;

let bluetoothCallback = null;
let usbCallback = null;
let serialCallback = null;
let hidCallback = null;

const FIREBASE_BASE_URL = 'https://tiendacarlitos-a5b1d-default-rtdb.firebaseio.com';
const MAX_CAJAS = 3;

// ═══════════════════════════════════════════════════════════════
// 📁 CONFIGURACIÓN DE TIENDA
// ═══════════════════════════════════════════════════════════════
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

function obtenerConfigLocal() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error("❌ Error al leer config.json:", e);
      return null;
    }
  }
  return null;
}

ipcMain.handle('guardar-tienda-id', async (event, nuevoTiendaId) => {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ 
      tiendaId: nuevoTiendaId.trim() 
    }, null, 2));
    console.log(`✅ [MAIN] tiendaId guardado: ${nuevoTiendaId}`);
    return { success: true };
  } catch (err) {
    console.error("❌ [MAIN] Error guardando tiendaId:", err);
    return { success: false, error: err.message };
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔒 VALIDACIÓN DE LICENCIA POR HARDWARE (MULTI-CAJA)
// ═══════════════════════════════════════════════════════════════
async function validarLicencia() {
  try {
    const config = obtenerConfigLocal();

    // Sin tienda configurada → mostrar setup
    if (!config || !config.tiendaId) {
      console.log("⚠️ [MAIN] Sin tiendaId configurado.");
      return { estado: 'REQUIERE_VINCULACION' };
    }

    const tiendaId = config.tiendaId;
    const idComputadora = machineIdSync();
    const dbUrl = `${FIREBASE_BASE_URL}/tiendas/${tiendaId}/licencia.json`;

    console.log(`🔒 [MAIN] Validando tienda: ${tiendaId}`);
    console.log(`🔒 [MAIN] HWID: ${idComputadora.substring(0, 16)}...`);

    const response = await fetch(dbUrl);
    const datos = await response.json();

    console.log(`🔒 [MAIN] Datos de licencia:`, JSON.stringify(datos));

    // ⭐ CASO 1: NO EXISTE LICENCIA → CREARLA
    if (!datos) {
      console.log("⚠️ [MAIN] No existe licencia. Creándola...");

      const licenciaNueva = {
        estado_licencia: "activa",
        fecha_vencimiento: "2026-12-31",
        max_cajas: MAX_CAJAS,
        hardware_ids: {
          [idComputadora]: {
            agregado: new Date().toISOString(),
            nombre: "Caja Principal"
          }
        },
        creado: new Date().toISOString()
      };

      await fetch(dbUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(licenciaNueva)
      });

      console.log(`✅ [MAIN] Licencia creada (Caja 1/${MAX_CAJAS})`);
      return { estado: 'OK' };
    }

    // ⭐ CASO 2: LICENCIA INACTIVA → BLOQUEAR
    if (datos.estado_licencia && datos.estado_licencia !== "activa" && datos.estado_licencia !== "demo") {
      dialog.showErrorBox("Licencia Inactiva", "La licencia está inactiva. Contacta a soporte.");
      return { estado: 'ERROR' };
    }

    // ⭐ CASO 3: MIGRAR licencia vieja (hardware_id único)
    if (datos.hardware_id && !datos.hardware_ids) {
      console.log("🔄 [MAIN] Migrando licencia antigua...");
      
      const hardwareIds = {};
      hardwareIds[datos.hardware_id] = {
        agregado: datos.creado || new Date().toISOString(),
        nombre: "Caja Principal"
      };

      await fetch(dbUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_ids: hardwareIds,
          max_cajas: MAX_CAJAS,
          hardware_id: null
        })
      });

      console.log("✅ [MAIN] Migración completa");
      return { estado: 'OK' };
    }

    // ⭐ CASO 4: BUSCAR EN hardware_ids
    const hardwareIds = datos.hardware_ids || {};
    const maxCajas = datos.max_cajas || MAX_CAJAS;

    // Ya está autorizado
    if (hardwareIds[idComputadora]) {
      console.log("✅ [MAIN] Este equipo está autorizado");
      return { estado: 'OK' };
    }

    // Es nuevo → verificar espacio
    const cajasActuales = Object.keys(hardwareIds).length;

    if (cajasActuales < maxCajas) {
      console.log(`✅ [MAIN] Agregando caja ${cajasActuales + 1}/${maxCajas}...`);
      await fetch(dbUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [`hardware_ids/${idComputadora}`]: {
            agregado: new Date().toISOString(),
            nombre: `Caja ${cajasActuales + 1}`
          }
        })
      });
      return { estado: 'OK' };
    }

    // ⭐ CASO 5: LÍMITE ALCANZADO → BLOQUEAR
    console.log(`❌ [MAIN] Límite alcanzado (${cajasActuales}/${maxCajas})`);
    
    dialog.showErrorBox(
      "Límite de Cajas Alcanzado",
      `Esta tienda admite máximo ${maxCajas} cajas.\n\n` +
      `Cajas activas:\n` +
      Object.entries(hardwareIds).map(([id, info]) => 
        `• ${info.nombre || 'Sin nombre'}`
      ).join('\n') +
      `\n\nPara agregar más cajas contacta a soporte:\n📱 +52 1 237 106 2600`
    );
    return { estado: 'ERROR' };

  } catch (error) {
    console.error("❌ [MAIN] Error validando licencia:", error);
    return { estado: 'OK' }; // Modo offline
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔗 SISTEMA MULTI-CAJA POR CÓDIGO
// ═══════════════════════════════════════════════════════════════

ipcMain.handle('generar-codigo-caja', async () => {
  try {
    const config = obtenerConfigLocal();
    if (!config || !config.tiendaId) {
      return { success: false, error: 'No hay tienda configurada' };
    }

    const licenciaUrl = `${FIREBASE_BASE_URL}/tiendas/${config.tiendaId}/licencia.json`;
    const licRes = await fetch(licenciaUrl);
    const licencia = await licRes.json();
    
    const hardwareIds = licencia?.hardware_ids || {};
    const cajasActuales = Object.keys(hardwareIds).length;
    
    if (cajasActuales >= MAX_CAJAS) {
      return { 
        success: false, 
        error: `Esta tienda ya tiene ${MAX_CAJAS} cajas. Contacta a soporte.`
      };
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const expira = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const url = `${FIREBASE_BASE_URL}/codigosCaja/${codigo}.json`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tiendaId: config.tiendaId,
        tiendaNombre: config.tiendaNombre || 'Mi Tienda',
        creado: new Date().toISOString(),
        expira,
        usado: false
      })
    });

    if (!res.ok) throw new Error('Error guardando código');

    console.log(`🔗 [MAIN] Código generado: ${codigo}`);
    return { 
      success: true, 
      codigo, 
      expira,
      cajasActuales,
      maxCajas: MAX_CAJAS
    };

  } catch (e) {
    console.error('❌ [MAIN] Error generando código:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('conectar-con-codigo', async (event, codigo) => {
  try {
    if (!codigo || codigo.length !== 6) {
      return { success: false, error: 'El código debe tener 6 dígitos' };
    }

    const url = `${FIREBASE_BASE_URL}/codigosCaja/${codigo}.json`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data) {
      return { success: false, error: 'Código no encontrado' };
    }

    if (data.usado) {
      return { success: false, error: 'Este código ya fue usado' };
    }

    if (new Date(data.expira) < new Date()) {
      return { success: false, error: 'El código ha expirado' };
    }

    // Verificar límite
    const licenciaUrl = `${FIREBASE_BASE_URL}/tiendas/${data.tiendaId}/licencia.json`;
    const licRes = await fetch(licenciaUrl);
    const licencia = await licRes.json();
    
    const hardwareIds = licencia?.hardware_ids || {};
    const cajasActuales = Object.keys(hardwareIds).length;
    
    if (cajasActuales >= MAX_CAJAS) {
      return { success: false, error: `Máximo ${MAX_CAJAS} cajas alcanzado` };
    }

    // Guardar config
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({
      tiendaId: data.tiendaId,
      tiendaNombre: data.tiendaNombre
    }, null, 2));

    // Marcar código usado
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usado: true,
        usadoEn: new Date().toISOString(),
        usadoPor: machineIdSync().substring(0, 16)
      })
    });

    console.log(`✅ [MAIN] Conectado a: ${data.tiendaId}`);
    return { 
      success: true, 
      tiendaId: data.tiendaId, 
      tiendaNombre: data.tiendaNombre 
    };

  } catch (e) {
    console.error('❌ [MAIN] Error conectando:', e);
    return { success: false, error: e.message };
  }
});

// ═══════════════════════════════════════════════════════════════
// 🧾 IMPRESIÓN DE TICKET (58mm)
// ═══════════════════════════════════════════════════════════════
ipcMain.handle('imprimir-ticket', async (event, data) => {
  return new Promise((resolve) => {
    const ventanaOculta = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    const htmlTicket = generarHTMLTicket(data);
    ventanaOculta.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlTicket));

    ventanaOculta.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        ventanaOculta.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: 'POS-58',
          pageSize: { width: 58000, height: 210000 },
          margins: { marginType: 'none' }
        }, (success, failureReason) => {
          if (success) {
            console.log('✅ Ticket impreso');
            resolve({ success: true });
          } else {
            console.error('❌ Error:', failureReason);
            resolve({ success: false, error: failureReason });
          }
          setTimeout(() => {
            if (!ventanaOculta.isDestroyed()) ventanaOculta.close();
          }, 500);
        });
      }, 300);
    });
  });
});

function generarHTMLTicket(data) {
  const { nombreTienda, fecha, items, total, received, change } = data;

  let filas = "";
  items.forEach(item => {
    filas += `<tr>
      <td>${item.piecesCount || item.qty}</td>
      <td>${item.name || "Producto"}</td>
      <td>$${(item.price * item.qty).toFixed(2)}</td>
    </tr>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { width: 58mm; max-width: 58mm; margin: 0; padding: 0; font-family: 'Courier New', monospace; font-size: 10px; background: #fff; color: #000; height: auto; overflow: hidden; transform: translateX(-2.5mm); }
.ticket { width: 48mm; margin: 0 auto; padding: 1mm; border: 1px solid #000; box-sizing: border-box; }
.header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 5px; }
.header h2 { margin: 0; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
.header p { margin: 2px 0; font-size: 8px; }
.items { width: 100%; border-collapse: collapse; margin: 3px 0; table-layout: fixed; }
.items th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 1px; font-size: 8px; text-align: left; }
.items th:nth-child(1) { width: 10%; text-align: center; }
.items th:nth-child(2) { width: 58%; }
.items th:nth-child(3) { width: 32%; text-align: right; }
.items td { padding: 2px 1px; font-size: 8px; font-weight: bold; vertical-align: top; word-break: break-word; }
.items td:nth-child(1) { text-align: center; }
.items td:nth-child(2) { text-transform: uppercase; }
.items td:nth-child(3) { text-align: right; white-space: nowrap; }
.totals { border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; }
.total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; }
.sub-row { display: flex; justify-content: space-between; font-size: 9px; margin-top: 1px; }
.footer { text-align: center; margin-top: 6px; border-top: 1px dashed #000; padding-top: 5px; font-size: 8px; font-weight: bold; }
</style>
</head>
<body>
    <div class="ticket">
        <div class="header">
            <h2>${nombreTienda}</h2>
            <p>${fecha}</p>
        </div>
        <table class="items">
            <thead><tr><th>Cant</th><th>Descripción</th><th>Imp</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>
        <div class="totals">
            <div class="total-row"><span>TOTAL</span><span>$${total.toFixed(2)}</span></div>
            <div class="sub-row"><span>Recibido</span><span>$${received.toFixed(2)}</span></div>
            <div class="sub-row" style="font-weight:bold;"><span>Cambio</span><span>$${change.toFixed(2)}</span></div>
        </div>
        <div class="footer">¡GRACIAS POR SU COMPRA!<br>VUELVA PRONTO</div>
    </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// 🏷️ IMPRESIÓN DE ETIQUETA (58mm)
// ═══════════════════════════════════════════════════════════════
ipcMain.handle('imprimir-etiqueta', async (event, data) => {
  return new Promise((resolve) => {
    const ventanaOculta = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false }
    });

    const htmlEtiqueta = generarHTMLEtiqueta(data);
    ventanaOculta.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlEtiqueta));

    ventanaOculta.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        ventanaOculta.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: 'POS-58',
          pageSize: { width: 54000, height: 210000 },
          margins: { marginType: 'none' }
        }, (success, failureReason) => {
          if (success) {
            console.log('✅ Etiqueta impresa');
            resolve({ success: true });
          } else {
            console.error('❌ Error:', failureReason);
            resolve({ success: false, error: failureReason });
          }
          setTimeout(() => {
            if (!ventanaOculta.isDestroyed()) ventanaOculta.close();
          }, 500);
        });
      }, 300);
    });
  });
});

function generarHTMLEtiqueta(data) {
  const { nombreTienda, producto, precio, codigo } = data;
  const precioFormateado = parseFloat(precio).toFixed(2);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { width: 54mm; max-width: 54mm; margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; color: #000; height: auto; overflow: hidden; transform: translateX(-2.5mm); }
.label-card { width: 50mm; margin: 0 auto; border: 2px solid #000; border-radius: 4px; padding: 2px 3px; text-align: center; box-sizing: border-box; }
.store-header { font-size: 9px; font-weight: 900; border-bottom: 1px dashed #000; padding-bottom: 1px; margin-bottom: 1px; color: #000; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; }
.product-name { font-size: 12px; font-weight: 900; text-transform: uppercase; margin: 1px 0; color: #000; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.1; }
.price-box { color: #000; border-radius: 0; padding: 0; margin: 1px 0; }
.price-label { font-size: 8px; font-weight: bold; letter-spacing: 1px; line-height: 1; }
.price-amount { font-size: 32px; font-weight: 900; line-height: 1; letter-spacing: -1px; color: #000; }
.barcode-area { margin-top: 1px; border-top: 1px dashed #000; padding-top: 1px; }
.barcode-text { font-family: 'Courier New', monospace; font-size: 11px; font-weight: 900; letter-spacing: 1px; color: #000; }
</style>
</head>
<body>
    <div class="label-card">
        <div class="store-header">${nombreTienda}</div>
        <div class="product-name">${producto}</div>
        <div class="price-box">
            <div class="price-label">PRECIO</div>
            <div class="price-amount">$${precioFormateado}</div>
        </div>
        <div class="barcode-area">
            <div class="barcode-text">${codigo}</div>
        </div>
    </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// 🪟 CREACIÓN DE VENTANA
// ═══════════════════════════════════════════════════════════════
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    icon: path.join(__dirname, 'assets/icono.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    serialCallback = callback;
    mainWindow.webContents.send('serial-port-list', portList);
  });

  mainWindow.webContents.session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    hidCallback = callback;
    mainWindow.webContents.send('hid-device-list', details.deviceList);
  });

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    bluetoothCallback = callback;
    mainWindow.webContents.send('bluetooth-device-list', deviceList);
  });

  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    usbCallback = callback;
    mainWindow.webContents.send('usb-device-list', details.deviceList);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['usb', 'serial', 'notifications', 'media', 'bluetooth'];
    callback(allowed.includes(permission));
  });

  mainWindow.webContents.session.setDevicePermissionHandler(() => true);
  mainWindow.webContents.session.setBluetoothPairingHandler((details, callback) => {
    callback({ confirmed: true });
  });
};

// ═══════════════════════════════════════════════════════════════
// 🚪 CERRAR APP
// ═══════════════════════════════════════════════════════════════
ipcMain.on('cerrar-app', () => {
  console.log("🚪 [MAIN] Cerrando...");
  if (mainWindow) mainWindow.close();
  app.quit();
});

// ═══════════════════════════════════════════════════════════════
// 🟢 IPCs DE DISPOSITIVOS
// ═══════════════════════════════════════════════════════════════
ipcMain.on('bluetooth-device-selected', (event, deviceId) => {
  if (bluetoothCallback) { bluetoothCallback(deviceId); bluetoothCallback = null; }
});

ipcMain.on('usb-device-selected', (event, deviceId) => {
  if (usbCallback) { usbCallback(deviceId); usbCallback = null; }
});

ipcMain.on('serial-port-selected', (event, portId) => {
  if (serialCallback) { serialCallback(portId); serialCallback = null; }
});

ipcMain.on('hid-device-selected', (event, deviceId) => {
  if (hidCallback) { hidCallback(deviceId); hidCallback = null; }
});

ipcMain.on('cancel-serial-selection', () => {
  if (serialCallback) { serialCallback(''); serialCallback = null; }
});
ipcMain.on('cancel-hid-selection', () => {
  if (hidCallback) { hidCallback(null); hidCallback = null; }
});
ipcMain.on('cancel-bluetooth-selection', () => {
  if (bluetoothCallback) { bluetoothCallback(''); bluetoothCallback = null; }
});
ipcMain.on('cancel-usb-selection', () => {
  if (usbCallback) { usbCallback(null); usbCallback = null; }
});

ipcMain.on('refresh-serial-selection', () => {
  if (serialCallback) { serialCallback(''); serialCallback = null; }
  if (mainWindow) mainWindow.webContents.send('trigger-serial-selector');
});
ipcMain.on('refresh-hid-selection', () => {
  if (hidCallback) { hidCallback(null); hidCallback = null; }
  if (mainWindow) mainWindow.webContents.send('trigger-hid-selector');
});
ipcMain.on('refresh-bluetooth-selection', () => {
  if (bluetoothCallback) { bluetoothCallback(''); bluetoothCallback = null; }
  if (mainWindow) mainWindow.webContents.send('trigger-bluetooth-selector');
});
ipcMain.on('refresh-usb-selection', () => {
  if (usbCallback) { usbCallback(null); usbCallback = null; }
  if (mainWindow) mainWindow.webContents.send('trigger-usb-selector');
});

// ═══════════════════════════════════════════════════════════════
// 📱 WHATSAPP
// ═══════════════════════════════════════════════════════════════
ipcMain.on('abrir-whatsapp-externo', (event, data) => {
  console.log("📱 [MAIN] WhatsApp:", data);
  let numero = '';
  let mensaje = '';

  if (typeof data === 'object' && data !== null) {
    numero = data.numero || '';
    mensaje = data.mensaje || '';
  } else {
    mensaje = String(data || '');
  }

  const msg = encodeURIComponent(mensaje);
  const appUrl = numero ? `whatsapp://send?phone=${numero}&text=${msg}` : `whatsapp://send?text=${msg}`;
  const webUrl = numero ? `https://web.whatsapp.com/send?phone=${numero}&text=${msg}` : `https://web.whatsapp.com/send?text=${msg}`;

  shell.openExternal(appUrl)
    .then(() => console.log("✅ WhatsApp Desktop abierto"))
    .catch(() => {
      shell.openExternal(webUrl)
        .then(() => console.log("✅ WhatsApp Web abierto"))
        .catch((err) => console.error("❌ Error:", err.message));
    });
});

// ═══════════════════════════════════════════════════════════════
// 🚀 INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════
app.whenReady().then(async () => {
  const res = await validarLicencia();

  if (res.estado === 'OK' || res.estado === 'REQUIERE_VINCULACION') {
    createWindow();
  } else {
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});