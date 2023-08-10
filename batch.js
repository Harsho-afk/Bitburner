import { getServers, getRootAccess, isPrepped, prep, targetFinder } from "./utils";

const TYPES = ["hack", "weaken1", "grow", "weaken2"];
const FILES = ["hack.js", "weaken.js", "grow.js"];
const SCRIPTS = { hack: "hack.js", weaken1: "weaken.js", grow: "grow.js", weaken2: "weaken.js" };
const COSTS = { hack: 1.7, weaken1: 1.75, grow: 1.75, weaken2: 1.75 };

/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail();

    while (true) {
        const batchPort = ns.getPortHandle(ns.pid);
        batchPort.clear();
        let target = "n00dles";
        let servers = getServers(ns);
        servers = servers.filter((server) => getRootAccess(ns, server));
        servers.forEach((server) => {
            target = targetFinder(ns, server, target, ns.fileExists("Formulas.exe", "home"));
            ns.scp(FILES, server, "home");
        });
        const ramServers = new Servers(ns, servers);
        const info = new Info(ns, target);
        if (!isPrepped(ns, target)) await prep(ns, info, ramServers);
        ns.clearLog();
        ns.print("Calculating. This may take a few seconds...");

        await calculate(ns, info, ramServers);
        info.calculate(ns);

        const tasks = [];
        let batchCount = 0;

        info.end = Date.now() + info.weakenTime - info.spacer;

        while (batchCount++ < info.depth) {
            for (const type of TYPES) {
                info.end += info.spacer;
                const task = new Task(type, info, batchCount);
                if (!ramServers.assign(task)) {
                    ns.print(`ERROR: Unable to assign ${type}. Dumping debug info:`);
                    ns.print(task);
                    ns.print(info);
                    ramServers.printServers(ns);
                    return;
                }
                tasks.push(task);
            }
        }

        for (const task of tasks) {
            task.end += info.delay;
            const taskPid = ns.exec(SCRIPTS[task.type], task.server, task.threads, JSON.stringify(task));
            if (!taskPid) {
                ns.print("ERROR WHILE DEPLOYING");
                ns.print(task);
                ns.print(info);
                ramServers.printServers(ns);
                throw new Error(`Unable to deploy ${task.type}`);
            }
            const taskPort = ns.getPortHandle(taskPid);
            await taskPort.nextWrite();
            info.dely += taskPort.read();
        }

        tasks.reverse();

        const timer = setInterval(() => {
            ns.clearLog();
            ns.print(`Hacking ~\$${ns.formatNumber(info.maxMoney * info.greed * batchCount * info.chance)} from ${info.target}`);
            ns.print(`Greed: ${Math.floor(info.greed * 1000) / 10}%`);
            ns.print(`Ram available: ${ns.formatRam(ramServers.totalRam)}/${ns.formatRam(ramServers.maxRam)}`);
            ns.print(`Total delay: ${info.delay}ms`);
            ns.print(`Active jobs remaining: ${tasks.length}`);
            ns.print(`ETA ${ns.tFormat(info.end - Date.now())}`);
        }, 1000);
        ns.atExit(() => {
            clearInterval(timer);
        });

        do {
            await batchPort.nextWrite();
            batchPort.clear();

            ramServers.finish(tasks.pop());
        } while (tasks.length > 0);
        clearInterval(timer);
    }
}

/** @param {NS} ns */
class Servers {
    servers = [];
    totalRam = 0;
    maxRam = 0;
    prepThreads = 0;
    index = new Map()
    /** @param {NS} ns */
    constructor(ns, servers) {
        for (const server of servers) {
            if (!ns.hasRootAccess(server)) continue;
            if (ns.getServerMaxRam(server) < 1.70) continue;
            this.maxRam += ns.getServerMaxRam(server);
            this.totalRam += ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
            this.prepThreads += Math.floor((ns.getServerMaxRam(server) - ns.getServerUsedRam(server)) / 1.75);
            this.servers.push({ server: server, ram: ns.getServerMaxRam(server) - ns.getServerUsedRam(server) });
        }
        this.sort();
        this.servers.forEach((server, index) => this.index.set(server.server, index));
    }

    sort() {
        this.servers.sort((x, y) => {
            if (x.server === "home") return 1;
            if (y.server === "home") return -1;

            return y.ram - x.ram;
        });
    }

    printServers(ns) {
        for (const server of this.servers) ns.print(server);
    }

    copyServers() {
        return this.servers.map(server => ({ ...server }));
    }

    assign(task) {
        const server = this.servers.find(server => server.ram >= task.cost);
        if (server) {
            task.server = server.server;
            server.ram -= task.cost;
            this.totalRam -= task.cost;
            return true;
        } else return false;
    }

    getServer(server) {
        if (this.index.has(server)) {
            return this.servers[this.index.get(server)];
        } else {
            throw new Error(`Server ${server} not found in RamNet.`);
        }
    }

    finish(task) {
        const server = this.getServer(task.server);
        server.ram += task.cost;
        this.totalRam += task.cost;
    }

    simAssign(threadCosts) {
        const pRam = this.cloneBlocks();
        let batches = 0;
        let found = true;
        while (found) {
            for (const cost of threadCosts) {
                found = false;
                const server = pRam.find(server => server.ram >= cost);
                if (server) {
                    server.ram -= cost;
                    found = true;
                } else break;
            }
            if (found) batches++;
        }
        return batches;
    }
}

class Task {
    constructor(type, info, batch) {
        this.type = type;
        this.end = info.end;
        this.time = info.times[type];
        this.target = info.target;
        this.threads = info.threads[type];
        this.cost = this.threads * COSTS[type];
        this.server = "none";
        this.report = true;
        this.port = info.port;
        this.batch = batch;
    }
}

/** @param {NS} ns */
class Info {
    constructor(ns, target) {
        this.target = target;
        this.maxMoney = ns.getServerMaxMoney(target);
        this.money = Math.max(ns.getServerMoneyAvailable(target), 1);
        this.minSec = ns.getServerMinSecurityLevel(target);
        this.sec = ns.getServerSecurityLevel(target);
        this.prepped = isPrepped(ns, target);
        this.chance = 0;
        this.weakenTime = 0;
        this.delay = 0;
        this.spacer = 5;
        this.greed = 0.1;
        this.depth = 0;

        this.times = { hack: 0, weaken1: 0, grow: 0, weaken2: 0 };
        this.end = 0;
        this.threads = { hack: 0, weaken1: 0, grow: 0, weaken2: 0 };

        this.port = ns.pid;
    }

    calculate(ns, greed = this.greed) {
        const target = this.target;
        const maxMoney = this.maxMoney;
        this.money = ns.getServerMoneyAvailable(target);
        this.sec = ns.getServerSecurityLevel(target);
        this.weakenTime = ns.getWeakenTime(target);
        this.times.weaken1 = this.weakenTime;
        this.times.weaken2 = this.weakenTime;
        this.times.hack = this.weakenTime / 4;
        this.times.grow = this.weakenTime * 0.8;

        const hPercent = ns.hackAnalyze(target);
        const amount = maxMoney * greed;
        const hThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(target, amount)), 1);
        const tGreed = hPercent * hThreads;

        const gThreads = Math.ceil(ns.growthAnalyze(target, maxMoney / (maxMoney - maxMoney * tGreed)) * 1.01);
        this.threads.weaken1 = Math.max(Math.ceil(hThreads * 0.002 / 0.05), 1);
        this.threads.weaken2 = Math.max(Math.ceil(gThreads * 0.004 / 0.05), 1);
        this.threads.hack = hThreads;
        this.threads.grow = gThreads;
        this.chance = ns.hackAnalyzeChance(target);
    }
}

/**
 * @param {NS} ns
 * @param {Info} info
 * @param {Servers} servers
 */
async function calculate(ns, info, servers) {
    const maxThreads = servers.servers[0].ram / 1.75;
    const maxMoney = info.maxMoney;
    const hackPer = ns.hackAnalyze(info.target);
    const weakenTime = ns.getWeakenTime(info.target);

    const minGreed = 0.001;
    const stepValue = 0.01;
    let greed = 0.99;
    let best = 0;
    while (greed > minGreed) {
        const amount = maxMoney * greed;
        const hackThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(info.target, amount)), 1);
        const totalGreed = hackPer * hackThreads;
        const growThreads = Math.ceil(ns.growthAnalyze(info.target, maxMoney / (maxMoney - maxMoney * totalGreed)) * 1.01);

        if (Math.max(hackThreads, growThreads) <= maxThreads) {
            const weaken1Threads = Math.max(Math.ceil(hackThreads * 0.002 / 0.05), 1);
            const weaken2Threads = Math.max(Math.ceil(growThreads * 0.004 / 0.05), 1);

            const threadCosts = [hackThreads * 1.7, weaken1Threads * 1.75, growThreads * 1.75, weaken2Threads * 1.75];

            const totalCost = threadCosts.reduce((t, c) => t + c);
            if (totalCost <= servers.totalRam) {
                const batchCount = servers.simAssign(threadCosts);
                const income = totalGreed * maxMoney * batchCount / (info.spacer * 4 * batchCount * weakenTime);
                if (income > best) {
                    best = income;
                    info.greed = totalGreed;
                    info.depth = batchCount;
                }
            }
        }
        await ns.sleep(0);
        greed -= stepValue;
    }
    if (best == 0) throw new Error("Not enough ram to run even a single batch. Something has gone seriously wrong.");
}