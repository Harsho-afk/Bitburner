import { isPrepped, prep, getServers, targetFinder, getRootAccess, RamInfo, findBatch } from "utils.js";

/** 
 * @param {NS} ns 
 * @param {RamInfo} ramInfo
*/
export async function main(ns, target) {
    ns.disableLog("ALL");
    ns.tail();

    const files = ["hack.js", "grow.js", "weaken.js"];
    const scripts = { hack: "hack.js", weaken1: "weaken.js", grow: "grow.js", weaken2: "weaken.js" };
    const types = ["hack", "weaken1", "grow", "weaken2"];

    let batchCount = 0;
    while (true) {
        const dataPort = ns.getPortHandle(ns.pid);
        dataPort.clear();

        let target = "n00dles";
        let servers = getServers(ns);
        servers = servers.filter((server) => getRootAccess(ns, server));
        servers.forEach((server) => {
            target = (ns.args[0] != undefined) ? ns.args[0] : targetFinder(ns, server, target, ns.fileExists("Formulas.exe", "home"));
            ns.scp(files, server, "home");
        });

        const ramInfo = new RamInfo(ns, servers);

        if (!isPrepped(ns, target)) await prep(ns, target, ramInfo);
        const threads = findBatch(ns, target, ramInfo);
        batchCount++;

        const port = ns.pid;
        const weakenTime = ns.getWeakenTime(target);
        const times = { hack: weakenTime / 4, weaken1: weakenTime, grow: weakenTime * 0.8, weaken2: weakenTime };
        const batchServer = { hack: ramInfo.assign(threads.hack * 1.7), weaken1: ramInfo.assign(threads.weaken1 * 1.75), grow: ramInfo.assign(threads.grow * 1.75), weaken2: ramInfo.assign(threads.weaken2 * 1.75) };
        const ends = { hack: Date.now() + weakenTime, weaken1: Date.now() + weakenTime + 5, grow: Date.now() + weakenTime + 10, weaken2: Date.now() + weakenTime + 15 };
        let delay = 0;
        let report = false;

        for (const type of types) {
            if (type == "weaken2") {
                report = true;
            } else {
                report = false;
            }

            ends[type] += delay;

            const info = { server: batchServer[type], target: target, port: port, type: type, time: times[type], end: ends[type], batch: batchCount, report: report};

            const typePid = ns.exec(scripts[type], batchServer[type], threads[type], JSON.stringify(info));
            if (!typePid) throw new Error("Unable to deploy " + info.type);

            const tPort = ns.getPortHandle(typePid);
            await tPort.nextWrite();
            delay += tPort.read();
        }

        const timer = setInterval(() => {
            ns.clearLog();
            ns.print("Hacking $" + ns.formatNumber(ns.getServerMaxMoney(target) * threads.greed) + " from " + target);
            ns.print("Running batch " + batchCount + ": ETA " + ns.tFormat(ends.weaken2 - Date.now()));
        }, 1000);
        ns.atExit(() => clearInterval(timer));

        await dataPort.nextWrite();
        dataPort.clear();
        clearInterval(timer);
    }
}