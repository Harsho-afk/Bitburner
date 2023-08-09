//source - https://github.com/DarkTechnomancer/darktechnomancer.github.io/tree/main/Part%204%3A%20Periodic
/** @param {NS} ns */
export async function main(ns) {

    const logFile = "log.txt";
    ns.clear(logFile);
    ns.disableLog("ALL");
    ns.tail();
    ns.moveTail(200, 200);
    const logPort = ns.getPortHandle(ns.pid);
    logPort.clear();

    while (true) {
        await logPort.nextWrite();
        do {
            const data = logPort.read();
            ns.print(data);
        } while (!logPort.empty());
    }
}