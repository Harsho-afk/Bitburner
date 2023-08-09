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
export function isPrepped(ns, server) {
    const tolerance = 0.0001;
    if (ns.getServerMaxMoney(server) == ns.getServerMoneyAvailable(server) && Math.abs(ns.getServerSecurityLevel(server) - ns.getServerMinSecurityLevel(server)) < tolerance) {
        return true;
    } else {
        return false;
    }
}

/** 
 * @param {NS} ns 
 * @param {RamInfo} ramInfo
*/
export async function prep(ns, target, ramInfo) {
    const maxMoney = ns.getServerMaxMoney(target);
    const minSec = ns.getServerMinSecurityLevel(target);
    let money = ns.getServerMoneyAvailable(target);
    let sec = ns.getServerSecurityLevel(target);
    while (!isPrepped(ns, target)) {
        const weakenTime = ns.getWeakenTime(target);
        const growTime = weakenTime * 0.8;
        const dataPort = ns.getPortHandle(ns.pid);
        dataPort.clear();

        const ramServers = ramInfo.copyBlocks();
        const maxThreads = Math.floor(ramInfo.maxBlockRam / 1.75);
        const totalThreads = ramInfo.prepThreads;
        let weakenThreads1 = 0;
        let weakenThreads2 = 0;
        let growThreads = 0;
        let batchCount = 1;
        let script, mode, type, report, time, end, port = ns.pid;
        /*
        Modes:
        0: Security only
        1: Money only
        2: One shot
        */

        if (money < maxMoney) {
            growThreads = Math.ceil(ns.growthAnalyze(target, maxMoney / money));
            weakenThreads2 = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / 0.05);
        }
        if (sec > minSec) {
            weakenThreads1 = Math.ceil((sec - minSec) * 20);
            if (!(weakenThreads1 + weakenThreads2 + growThreads <= totalThreads && growThreads <= maxThreads)) {
                growThreads = 0;
                weakenThreads2 = 0;
                batchCount = Math.ceil(weakenThreads1 / totalThreads);
                if (batchCount > 1) weakenThreads1 = totalThreads;
                mode = 0;
            } else mode = 2;
        } else if (growThreads > maxThreads || growThreads + weakenThreads2 > totalThreads) {
            mode = 1;
            const oldG = growThreads;
            weakenThreads2 = Math.max(Math.floor(totalThreads / 13.5), 1);
            growThreads = Math.floor(weakenThreads2 * 12.5);
            batchCount = Math.ceil(oldG / growThreads);
        } else mode = 2;

        const weaken1End = Date.now() + weakenTime + 1000;
        const growEnd = weaken1End + 5;
        const weaken2End = growEnd + 5;

        for (const block of ramServers) {
            while (block.ram >= 1.75) {
                const maxThreads = Math.floor(block.ram / 1.75)
                let threads = 0;
                if (weakenThreads1 > 0) {
                    script = "weaken.js";
                    type = "weaken1";
                    time = weakenTime;
                    end = weaken1End;
                    threads = Math.min(weakenThreads1, maxThreads);
                    if (weakenThreads2 === 0 && weakenThreads1 - threads <= 0) report = true;
                    weakenThreads1 -= threads;
                } else if (weakenThreads2 > 0) {
                    script = "weaken.js";
                    type = "weaken2";
                    time = weakenTime;
                    end = weaken2End;
                    threads = Math.min(weakenThreads2, maxThreads);
                    if (weakenThreads2 - threads === 0) report = true;
                    weakenThreads2 -= threads;
                } else if (growThreads > 0 && mode === 1) {
                    script = "grow.js";
                    type = "grow";
                    time = growTime;
                    end = growEnd;
                    threads = Math.min(growThreads, maxThreads);
                    report = false;
                    growThreads -= threads;
                } else if (growThreads > 0 && maxThreads >= growThreads) {
                    script = "grow.js";
                    type = "grow";
                    time = growTime;
                    end = growEnd;
                    threads = growThreads;
                    report = false;
                    growThreads = 0;
                } else break;

                const info = { server: block.server, target: target, port: port, type: type, time: time, end: end, batch: batchCount, report: report };

                const pid = ns.exec(script, block.server, threads, JSON.stringify(info));
                if (!pid) throw new Error("Unable to assign all jobs.");
                block.ram -= 1.75 * threads;
            }
        }

        const tEnd = ((mode === 0 ? weaken1End : weaken2End) - Date.now()) * batchCount + Date.now();
        const timer = setInterval(() => {
            ns.clearLog();
            switch (mode) {
                case 0:
                    ns.print(`Weakening security on ${target}...`);
                    break;
                case 1:
                    ns.print(`Maximizing money on ${target}...`);
                    break;
                case 2:
                    ns.print(`Finalizing preparation on ${target}...`);
            }
            ns.print(`Security: ${ns.formatNumber(sec - minSec, 3)}`);
            ns.print(`Money: \$${ns.formatNumber(money, 2)}/${ns.formatNumber(maxMoney, 2)}`);
            const time = tEnd - Date.now();
            ns.print(`Estimated time remaining: ${ns.tFormat(time)}`);
            ns.print(`~${batchCount} ${(batchCount === 1) ? "batch" : "batches"}.`);
        }, 1000);
        ns.atExit(() => clearInterval(timer));

        do await dataPort.nextWrite(); while (!dataPort.read().startsWith("weaken"));
        clearInterval(timer);
        await ns.sleep(100);

        money = ns.getServerMoneyAvailable(target);
        sec = ns.getServerSecurityLevel(target);
    }
    return true;
}

/** @param {NS} ns */
export class RamInfo {
    blocks = [];
    maxBlockRam = 0;
    minBlockRam = Infinity;
    totalRam = 0;
    maxRam = 0;
    prepThreads = 0;
    index = new Map();

    /** @param {NS} ns */
    constructor(ns, servers) {
        for (const server of servers) {
            if (ns.hasRootAccess(server)) {
                const maxRam = ns.getServerMaxRam(server);
                const ram = maxRam - ns.getServerUsedRam(server);
                if (ram > 1.60) {
                    const block = { server: server, ram: ram };
                    this.blocks.push(block);
                    if (ram < this.minBlockRam) this.minBlockRam = ram;
                    if (ram > this.maxBlockRam) this.maxBlockRam = ram;
                    this.totalRam += ram;
                    this.maxRam += maxRam;
                    this.prepThreads += Math.floor(ram / 1.75);
                }
            }
        }
        this.sort();
        this.blocks.forEach((block, index) => this.index.set(block.server, index));
    }

    sort() {
        this.blocks.sort((x, y) => {
            if (x.server === "home") return 1;
            if (y.server === "home") return -1;

            return y.ram - x.ram;
        });
    }

    getBlock(server) {
        if (this.index.has(server)) {
            return this.blocks[this.index.get(server)];
        } else {
            throw new Error("Server " + server + " not found in RamServer.");
        }
    }

    copyBlocks() {
        return this.blocks.map(block => ({ ...block }));
    }

    assign(cost) {
        let server;
        const block = this.blocks.find(block => block.ram >= cost);
        if (block) {
            server = block.server;
            block.ram -= cost;
            this.totalRam -= cost;
        }
        return server;
    }

    printBlocks(ns) {
        for (const block of this.blocks) ns.tprint(block);
    }
}

/** 
 * @param {NS} ns 
 * @param {RamInfo} ramInfo
*/
export function findBatch(ns, server, ramInfo) {
    const maxThreads = ramInfo.maxBlockRam / 1.75;
    const maxMoney = ns.getServerMaxMoney(server);
    const hackReturnPer = ns.hackAnalyze(server);
    const minGreed = 0.001;
    const stepValue = 0.001;
    let greed = 0.99;
    while (greed > minGreed) {
        const amount = maxMoney * greed;
        const hackThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(server, amount)), 1);
        const totalHackreturnPer = hackReturnPer * hackThreads;
        const growThreads = Math.ceil(ns.growthAnalyze(server, maxMoney / (maxMoney - (maxMoney * totalHackreturnPer))));
        if (Math.max(hackThreads, growThreads) <= maxThreads) {
            const weakenThreads1 = Math.max(Math.ceil(hackThreads * 0.002 / 0.05), 1);
            const weakenThreads2 = Math.max(Math.ceil(growThreads * 0.004 / 0.05), 1);

            const threadCost = [hackThreads * 1.7, weakenThreads1 * 1.75, weakenThreads2 * 1.75, growThreads * 1.75];

            const ramServers = ramInfo.copyBlocks();
            let found;
            for (const cost of threadCost) {
                found = false;
                for (const block of ramServers) {
                    if (block.ram < cost) continue;
                    found = true;
                    block.ram -= cost;
                    break;
                }
                if (found) continue;
                break;
            }
            if (found) {
                return { greed: greed, hack: hackThreads, weaken1: weakenThreads1, grow: growThreads, weaken2: weakenThreads2 };
            }
        }
        greed -= stepValue;
    }
    throw new Error("Not enough ram to run even a single batch. Something has gone seriously wrong.");
}