/** @param {NS} ns */
export function getServers(ns, hostname = "home", servers = [], visited = []) {
    if (visited.includes(hostname)) return;
    visited.push(hostname);
    servers.push(hostname);
    const connectedNodes = ns.scan(hostname);
    if (hostname !== "home") connectedNodes.shift();
    for (const node of connectedNodes) getServers(ns, node, servers, visited);
    return servers;
}

/** @param {NS} ns */
export function getRootAccess(ns, server) {
    if (ns.hasRootAccess(server)) {
        return true;
    }
    let openPorts = 0;
    if (ns.fileExists("BruteSSH.exe", "home")) {
        ns.brutessh(server);
        openPorts = openPorts + 1;
    }
    if (ns.fileExists("ftpcrack.exe", "home")) {
        ns.ftpcrack(server);
        openPorts = openPorts + 1;
    }
    if (ns.fileExists("relaysmtp.exe", "home")) {
        ns.relaysmtp(server);
        openPorts = openPorts + 1;
    }
    if (ns.fileExists("httpworm.exe", "home")) {
        ns.httpworm(server);
        openPorts = openPorts + 1;
    }
    if (ns.fileExists("sqlinject.exe", "home")) {
        ns.sqlinject(server);
        openPorts = openPorts + 1;
    }
    if (ns.getServerNumPortsRequired(server) <= openPorts) {
        ns.nuke(server);
        return true;
    }
    return false;
}

/** @param {NS} ns */
export function targetFinder(ns, server, target = "n00dles", forms = false) {
    let prevScore, currScore;
    const serverSim = ns.getServer(server);
    const pSim = ns.getServer(target);
    const player = ns.getPlayer();
    if (ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel() / (forms ? 1 : 2)) {
        if (forms) {
            serverSim.hackDifficulty = serverSim.minDifficulty;
            pSim.hackDifficulty = pSim.minDifficulty;
            prevScore = pSim.moneyMax / ns.formulas.hacking.weakenTime(pSim, player) * ns.formulas.hacking.hackChance(pSim, player);
            currScore = serverSim.moneyMax / ns.formulas.hacking.weakenTime(serverSim, player) * ns.formulas.hacking.hackChance(serverSim, player);
        } else {
            prevScore = pSim.moneyMax / pSim.minDifficulty;
            currScore = serverSim.moneyMax / serverSim.minDifficulty;
        }
        if (currScore > prevScore) {
            target = server;
        }
    }
    return target;
}

/** @param {NS} ns */
export function calcBestRam(ns, numServers) {
    let ramList = [];

    let i = 1;
    while (ramList.length < 20) {
        let result = Math.pow(2, i);
        ramList.push(result);
        i++;
    }
    let affordableRamList = 8;
    if (ns.getPurchasedServers().length >= ns.getPurchasedServerLimit()) {
        affordableRamList = ramList.filter(ram => (ns.getPurchasedServers().length * ns.getPurchasedServerUpgradeCost(ns.getPurchasedServers()[0], ram)) <= ns.getServerMoneyAvailable("home"));
    } else {
        affordableRamList = ramList.filter(ram => (numServers * ns.getPurchasedServerCost(ram)) <= ns.getServerMoneyAvailable("home"));
    }
    const bestRam = ramList[affordableRamList.length - 1];
    return bestRam;
}

/** @param {NS} ns */
export function isPrepped(ns, target) {
    const tolerance = 0.0001;
    if (ns.getServerMaxMoney(target) == ns.getServerMoneyAvailable(target) && Math.abs(ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)) < tolerance) {
        return true;
    } else {
        return false;
    }
}

/** @param {NS} ns */
export async function prep(ns, info, ramServers) {
    const maxMoney = info.maxMoney;
    const minSec = info.minSec;
    let money = info.money;
    let sec = info.sec;
    while (!isPrepped(ns, info.target)) {
        const weakenTime = ns.getWeakenTime(info.target);
        const growTime = weakenTime * 0.8;
        const prepPort = ns.getPortHandle(ns.pid);
        prepPort.clear();

        const servers = ramServers.copyServers();
        const maxThreads = Math.floor(ramServers.servers[0].ram / 1.75);
        const totalThreads = ramServers.prepThreads;
        let weaken1Threads = 0;
        let weaken2Threads = 0;
        let growThreads = 0;
        let batchCount = 1;
        let script, mode;
        /*
        Modes:
        0: Security only
        1: Money only
        2: One shot
        */

        if (money < maxMoney) {
            growThreads = Math.ceil(ns.growthAnalyze(info.target, maxMoney / money));
            weaken2Threads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / 0.05);
        }
        if (sec > minSec) {
            weaken1Threads = Math.ceil((sec - minSec) * 20);
            if (!(weaken1Threads + weaken2Threads + growThreads <= totalThreads && growThreads <= maxThreads)) {
                growThreads = 0;
                weaken2Threads = 0;
                batchCount = Math.ceil(weaken1Threads / totalThreads);
                if (batchCount > 1) weaken1Threads = totalThreads;
                mode = 0;
            } else mode = 2;
        } else if (growThreads > maxThreads || growThreads + weaken2Threads > totalThreads) {
            mode = 1;
            const oldG = growThreads;
            weaken2Threads = Math.max(Math.floor(totalThreads / 13.5), 1);
            growThreads = Math.floor(weaken2Threads * 12.5);
            batchCount = Math.ceil(oldG / growThreads);
        } else mode = 2;

        const wEnd1 = Date.now() + weakenTime + 1000;
        const gEnd = wEnd1 + info.spacer;
        const wEnd2 = gEnd + info.spacer;

        const task = {
            batch: "prep",
            target: info.target,
            type: "none",
            time: 0,
            end: 0,
            port: ns.pid,
            report: false
        };

        for (const server of servers) {
            while (server.ram >= 1.75) {
                const serverMaxThreads = Math.floor(server.ram / 1.75)
                let threads = 0;
                if (weaken1Threads > 0) {
                    script = "weaken.js";
                    task.type = "pWeaken1";
                    task.time = weakenTime;
                    task.end = wEnd1;
                    threads = Math.min(weaken1Threads, serverMaxThreads);
                    if (weaken2Threads === 0 && weaken1Threads - threads <= 0) task.report = true;
                    weaken1Threads -= threads;
                } else if (weaken2Threads > 0) {
                    script = "weaken.js";
                    task.type = "pWeaken2";
                    task.time = weakenTime;
                    task.end = wEnd2;
                    threads = Math.min(weaken2Threads, serverMaxThreads);
                    if (weaken2Threads - threads === 0) task.report = true;
                    weaken2Threads -= threads;
                } else if (growThreads > 0 && mode === 1) {
                    script = "grow.js";
                    task.type = "pGrow";
                    task.time = growTime;
                    task.end = gEnd;
                    threads = Math.min(growThreads, serverMaxThreads);
                    task.report = false;
                    growThreads -= threads;
                } else if (growThreads > 0 && serverMaxThreads >= growThreads) {
                    script = "grow.js";
                    task.type = "pGrow";
                    task.time = growTime;
                    task.end = gEnd;
                    threads = growThreads;
                    task.report = false;
                    growThreads = 0;
                } else break;
                task.server = server.server;
                const pid = ns.exec(script, server.server, threads, JSON.stringify(task));
                if (!pid) throw new Error("Unable to assign all jobs.");
                server.ram -= 1.75 * threads;
            }
        }

        const tEnd = ((mode === 0 ? wEnd1 : wEnd2) - Date.now()) * batchCount + Date.now();
        const timer = setInterval(() => {
            ns.clearLog();
            switch (mode) {
                case 0:
                    ns.print(`Weakening security on ${info.target}...`);
                    break;
                case 1:
                    ns.print(`Maximizing money on ${info.target}...`);
                    break;
                case 2:
                    ns.print(`Finalizing preparation on ${info.target}...`);
            }
            ns.print(`Security: ${ns.formatNumber(sec - minSec, 3)}`);
            ns.print(`Money: \$${ns.formatNumber(money, 2)}/${ns.formatNumber(maxMoney, 2)}`);
            const time = tEnd - Date.now();
            ns.print(`Estimated time remaining: ${ns.tFormat(time)}`);
            ns.print(`~${batchCount} ${(batchCount === 1) ? "batch" : "batches"}.`);
        }, 200);
        ns.atExit(() => clearInterval(timer));

        do await prepPort.nextWrite(); while (!prepPort.read().startsWith("pWeaken"));
        clearInterval(timer);
        await ns.sleep(100);

        money = ns.getServerMoneyAvailable(info.target);
        sec = ns.getServerSecurityLevel(info.target);
    }
    return true;
}