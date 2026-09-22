const { machineIdSync } = require("node-machine-id");
const os = require("os");
const crypto = require("crypto");

function obtenerHardwareID() {
    try {
        // 1. Machine ID (basado en MAC + otros)
        const machineId = machineIdSync(true); // true = original, no hasheado por la lib

        // 2. Datos adicionales del sistema
        const cpuModel = os.cpus()[0]?.model || "unknown";
        const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024)) + "GB";
        const platform = os.platform();
        const arch = os.arch();
        const hostname = os.hostname();

        // 3. Combinar todo
        const combinado = [
            machineId,
            cpuModel,
            totalMem,
            platform,
            arch,
            hostname
        ].join("|");

        // 4. Generar hash SHA-256 (64 caracteres)
        const hash = crypto.createHash("sha256").update(combinado).digest("hex");

        // 5. Devolver en formato legible
        return {
            hardwareId: hash,
            shortId: hash.substring(0, 16).toUpperCase(), // Para mostrar al usuario
            detalles: {
                machineId: machineId.substring(0, 8) + "...",
                cpu: cpuModel,
                ram: totalMem,
                os: `${platform} ${arch}`,
                hostname: hostname
            }
        };
    } catch (e) {
        console.error("Error al obtener hardware ID:", e);
        return null;
    }
}

module.exports = { obtenerHardwareID };