//source - https://github.com/DarkTechnomancer/darktechnomancer.github.io/tree/main/Part%204%3A%20Periodic
import { getServers, getRootAccess, isPrepped, prep, Deque } from "utils.js";

const TYPES = ["hack", "weaken1", "grow", "weaken2"];
const WORKERS = ["hack.js", "weaken.js", "grow.js"];
const SCRIPTS = { hack: "hack.js", weaken1: "weaken.js", grow: "grow.js", weaken2: "weaken.js" };
const COSTS = { hack: 1.7, weaken1: 1.75, grow: 1.75, weaken2: 1.75 };

const RESERVED_HOME_RAM = 20;

class ContinuousBatcher {
	#ns;
	#metrics;
	#ramNet;
	#target;
	#schedule;
	#dataPort;
	#batchCount = 0;
	#desyncs = 0;

	// A capital M Map. We'll use this to keep track of active jobs.
	#running = new Map();

	constructor(ns, metrics, ramNet) {
		this.#ns = ns;
		this.#metrics = metrics;
		this.#ramNet = ramNet;
		this.#target = metrics.target;
		this.#dataPort = ns.getPortHandle(ns.pid);

		// Seeding the first ending time.
		this.#metrics.end = Date.now() + metrics.wTime - metrics.spacer;

		// The new schedule I promised. It's a double-ended queue, but we'll mostly just be using it as a normal queue.
		// It has a static size, so we make sure it can accomodate all of our jobs.
		this.#schedule = new Deque(metrics.depth * 4);
	}

	// This is a function that can schedule a given number of batches.
	// With no arguments, it just fills up the queue.
	scheduleBatches(batches = this.#metrics.depth) {
		while (this.#schedule.size < batches * 4) {
			++this.#batchCount;
			for (const type of TYPES) {
				this.#metrics.end += this.#metrics.spacer;
				const job = new Job(type, this.#metrics, this.#batchCount);

				/*
				We don't actually error out if a job can't be assigned anymore. Instead, we just assign as much
				as we can. If it desyncs, the logic will correct it, and if a weaken2 gets cancelled then the actual
				depth will naturally decrease below the target depth. Not a perfect fix, but better than breaking.
				*/
				if (!this.#ramNet.assign(job)) {
					this.#ns.tprint(`WARN: Insufficient RAM to assign ${job.type}: ${job.batch}.`);
					continue;
				}
				this.#schedule.push(job);
			}
		}
	}

	// The function for deploying jobs. Very similar to the code from our shotgun batcher with some minor changes.
	async deploy() {
		// The for loop is replaced by a while loop, since our Deque isn't iterable.
		while (!this.#schedule.isEmpty()) {
			const job = this.#schedule.shift();
			job.end += this.#metrics.delay;
			const jobPid = this.#ns.exec(SCRIPTS[job.type], job.server, job.threads, JSON.stringify(job));
			if (!jobPid) throw new Error(`Unable to deploy ${job.type}`);
			const tPort = this.#ns.getPortHandle(jobPid);

			// We save the pid for later.
			job.pid = jobPid;
			await tPort.nextWrite();

			// Jobs can be late as long as the delay won't cause collisions.
			this.#metrics.delay += Math.max(Math.ceil(tPort.read()) - this.#metrics.spacer, 0);
			this.#running.set(job.id, job);
		}

		// After the loop, we adjust future job ends to account for the delay, then discard it.
		this.#metrics.end += this.#metrics.delay;
		this.#metrics.delay = 0;
	}

	// Our old timeout function is now a proper function of its own. A few extra baubles in the log, but nothing exciting.
	/** @param {NS} ns */
	log() {
		const ns = this.#ns;
		const metrics = this.#metrics;
		const ramNet = this.#ramNet;
		ns.clearLog();
		ns.print(`Hacking ~\$${ns.formatNumber(metrics.maxMoney * metrics.greed * metrics.chance / (4 * metrics.spacer) * 1000)}/s from ${metrics.target}`);
		ns.print(`Status: ${isPrepped(ns, this.#target) ? "Prepped" : "Desynced"}`);
		ns.print(`Security: +${metrics.minSec - metrics.sec}`);
		ns.print(`Money: \$${ns.formatNumber(metrics.money, 2)}/${ns.formatNumber(metrics.maxMoney, 2)}`);
		ns.print(`Greed: ${Math.floor(metrics.greed * 1000) / 10}%`);
		ns.print(`Ram available: ${ns.formatRam(ramNet.totalRam)}/${ns.formatRam(ramNet.maxRam)}`);
		ns.print(`Active jobs: ${this.#running.size}/${metrics.depth * 4}`);

		if (this.#desyncs) ns.print(`Hacks cancelled by desync: ${this.#desyncs}`);
	}

	// The core loop of our batcher logic. Quite lean with everything neatly divided into functions, but there's still
	// plenty going on here.
	async run() {
		// First we do some initial setup, this is essentially firing off a shotgun blast to get us started.
		const dataPort = this.#dataPort;
		this.scheduleBatches();
		await this.deploy();
		//await this.#ns.sleep(0); // This is probably pointless. I forget why I put it here.
		this.log();
		while (true) {
			// Wait for the nextWrite, as usual.
			await dataPort.nextWrite();

			// Sometimes there's a delay and more than one job writes to the port at once.
			// We make sure to handle it all before we move on.
			while (!dataPort.empty()) {
				// Workers now report unique identifiers (type + batchnumber) used to find them on the map.
				const data = dataPort.read();

				// Free up the ram, them remove them from the active list.
				// The check handles a corner case where a hack gets "cancelled" after it's already finished.
				if (this.#running.has(data)) {
					this.#ramNet.finish(this.#running.get(data));
					this.#running.delete(data);
				}

				// If it's a W2, we've got an opening to do some work.
				if (data.startsWith("weaken2")) {
					// Recalculate times. Threads too, but only if prepped (the logic is in the function itself).
					this.#metrics.calculate(this.#ns);

					/*
					This is probably the most JIT-like aspect of the entire batcher. If the server isn't prepped, then
					we cancel the next hack to let the server fix itself. Between this and the extra 1% grow threads, level
					ups are completely handled. Rapid level ups can lead to a lot of lost jobs, but eventually the program
					stabilizes.

					There are probably more efficient ways to do this. Heck, even this solution could be optimized better,
					but for now, this is an adequate demonstration of a reasonable non-formulas solution to the level up
					problem. It also lets us dip our toes into JIT logic in preparation for the final part.
					*/
					if (!isPrepped(this.#ns, this.#target)) {
						const id = "hack" + (parseInt(data.slice(7)) + 1);
						const cancel = this.#running.get(id);
						// Just in case the hack was already aborted somehow.
						if (cancel) {
							this.#ramNet.finish(cancel);
							this.#ns.kill(cancel.pid);
							this.#running.delete(id);
							++this.#desyncs; // Just to keep track of how much we've lost keeping things prepped.
						}
					}

					// Then of course we just schedule and deploy a new batch.
					this.scheduleBatches(1);
					await this.deploy();
					this.log();
				}
			}
		}
	}
}

/*
	Our poor "main" function isn't much more than a kickstart for our new batcher object. It's a bit weird having
	it wedged between objects like this, but I wanted to have the new functionality up at the top since most of the
	remaining code hasn't changed much. I'll comment the changes anyway.
*/
/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog("ALL");
	ns.tail();

	const dataPort = ns.getPortHandle(ns.pid);
	dataPort.clear();
	let target = ns.args[0] ? ns.args[0] : "n00dles";
	while (true) {
		let servers = getServers(ns);
		servers = servers.filter((server) => getRootAccess(ns, server));
		servers.forEach((server) => {
			if (!ns.args[0]) target = targetFinder(ns, server, target, ns.fileExists("Formulas.exe", "home"));
			ns.scp(WORKERS, server, "home");
		});
		const ramNet = new RamNet(ns, servers);
		const metrics = new Metrics(ns, target);
		if (!isPrepped(ns, target)) await prep(ns, metrics, ramNet);
		ns.clearLog();
		ns.print("Optimizing. This may take a few seconds...");

		// Optimizer has changed again. Back to being synchronous, since the performance is much better.
		optimizePeriodic(ns, metrics, ramNet);
		metrics.calculate(ns);

		// Create and run our batcher.
		const batcher = new ContinuousBatcher(ns, metrics, ramNet);
		await batcher.run();

		/*
		You might be wondering why I put this in a while loop and then just return here. The simple answer is that
		it's because this is meant to be run in a loop, but I didn't implement the logic for it. This version of the
		batcher is completely static once created. It sticks to a single greed value, and doesn't update if more
		RAM becomes available.

		In a future version, you'd want some logic to allow the batcher to choose new targets, update its available RAM,
		and create new batchers during runtime. For now, that's outside the scope of this guide, but consider this loop
		as a sign of what could be.
		*/
		return;
	}
}

class Job {
	constructor(type, metrics, batch) {
		this.type = type;
		this.end = metrics.end;
		this.time = metrics.times[type];
		this.target = metrics.target;
		this.threads = metrics.threads[type];
		this.cost = this.threads * COSTS[type];
		this.server = "none";
		this.report = true;
		this.port = metrics.port;
		this.batch = batch;

		this.status = "active";
		this.id = type + batch;
	}
}

/** @param {NS} ns */
class Metrics {
	constructor(ns, server) {
		this.target = server;
		this.maxMoney = ns.getServerMaxMoney(server);
		this.money = Math.max(ns.getServerMoneyAvailable(server), 1);
		this.minSec = ns.getServerMinSecurityLevel(server);
		this.sec = ns.getServerSecurityLevel(server);
		this.prepped = isPrepped(ns, server);
		this.chance = 0;
		this.wTime = 0;
		this.delay = 0;
		this.spacer = 5;
		this.greed = 0.01;
		this.depth = 0; // The number of concurrent batches to run. Set by the optimizer.

		this.times = { hack: 0, weaken1: 0, grow: 0, weaken2: 0 };
		this.end = 0;
		this.threads = { hack: 0, weaken1: 0, grow: 0, weaken2: 0 };

		this.port = ns.pid;
	}

	calculate(ns, greed = this.greed) {
		const server = this.target;
		const maxMoney = this.maxMoney;
		this.money = ns.getServerMoneyAvailable(server);
		this.sec = ns.getServerSecurityLevel(server);
		this.wTime = ns.getWeakenTime(server);
		this.times.weaken1 = this.wTime;
		this.times.weaken2 = this.wTime;
		this.times.hack = this.wTime / 4;
		this.times.grow = this.wTime * 0.8;

		if (isPrepped(ns, server)) {
			const hPercent = ns.hackAnalyze(server);
			const amount = maxMoney * greed;
			const hThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(server, amount)), 1);
			const tGreed = hPercent * hThreads;
			const gThreads = Math.ceil(ns.growthAnalyze(server, maxMoney / (maxMoney - maxMoney * tGreed)) * 1.01);
			this.threads.weaken1 = Math.max(Math.ceil(hThreads * 0.002 / 0.05), 1);
			this.threads.weaken2 = Math.max(Math.ceil(gThreads * 0.004 / 0.05), 1);
			this.threads.hack = hThreads;
			this.threads.grow = gThreads;
			this.chance = ns.hackAnalyzeChance(server);
		}
	}
}

/** @param {NS} ns */
class RamNet {
	#blocks = [];
	#minBlockSize = Infinity;
	#maxBlockSize = 0;
	#totalRam = 0;
	#prepThreads = 0;
	#maxRam = 0;
	#index = new Map();

	// Simulate mode ignores running scripts. Can be used to make calculations while the batcher is operating.
	constructor(ns, servers, simulate = false) {
		for (const server of servers) {
			if (ns.hasRootAccess(server)) {
				const maxRam = ns.getServerMaxRam(server);
				// Save some extra ram on home. Clamp used ram to maxRam to prevent negative numbers.
				const reserved = (server === "home") ? RESERVED_HOME_RAM : 0;
				const used = Math.min((simulate ? 0 : ns.getServerUsedRam(server)) + reserved, maxRam);
				const ram = maxRam - used;
				if (maxRam > 0) {
					const block = { server: server, ram: ram };
					this.#blocks.push(block);
					if (ram < this.#minBlockSize) this.#minBlockSize = ram;
					if (ram > this.#maxBlockSize) this.#maxBlockSize = ram;
					this.#totalRam += ram;
					this.#maxRam += maxRam;
					this.#prepThreads += Math.floor(ram / 1.75);
				}
			}
		}
		this.#sort();
		this.#blocks.forEach((block, index) => this.#index.set(block.server, index));
	}

	#sort() {
		this.#blocks.sort((x, y) => {
			if (x.server === "home") return 1;
			if (y.server === "home") return -1;

			return x.ram - y.ram;
		});
	}

	get totalRam() {
		return this.#totalRam;
	}

	get maxRam() {
		return this.#maxRam;
	}

	get maxBlockSize() {
		return this.#maxBlockSize;
	}

	get prepThreads() {
		return this.#prepThreads;
	}

	getBlock(server) {
		if (this.#index.has(server)) {
			return this.#blocks[this.#index.get(server)];
		} else {
			throw new Error(`Server ${server} not found in RamNet.`);
		}
	}

	assign(job) {
		const block = this.#blocks.find(block => block.ram >= job.cost);
		if (block) {
			job.server = block.server;
			block.ram -= job.cost;
			this.#totalRam -= job.cost;
			return true;
		} else return false;
	}

	finish(job) {
		const block = this.getBlock(job.server);
		block.ram += job.cost;
		this.#totalRam += job.cost;
	}

	cloneBlocks() {
		return this.#blocks.map(block => ({ ...block }));
	}

	printBlocks(ns) {
		for (const block of this.#blocks) ns.print(block);
	}

	testThreads(threadCosts) {
		const pRam = this.cloneBlocks();
		let batches = 0;
		let found = true;
		while (found) {
			for (const cost of threadCosts) {
				found = false;
				const block = pRam.find(block => block.ram >= cost);
				if (block) {
					block.ram -= cost;
					found = true;
				} else break;
			}
			if (found) batches++;
		}
		return batches;
	}
}

/**
 * @param {NS} ns
 * @param {Metrics} metrics
 * @param {RamNet} ramNet
 */
function optimizePeriodic(ns, metrics, ramNet) {
	const maxThreads = ramNet.maxBlockSize / 1.75;
	const maxMoney = metrics.maxMoney;
	const hPercent = ns.hackAnalyze(metrics.target);
	const wTime = ns.getWeakenTime(metrics.target);

	const minGreed = 0.001;
	const maxSpacer = wTime; // This is more of an infinite loop safety net than anything.
	const stepValue = 0.001;
	let greed = 0.99;
	let spacer = metrics.spacer;

	while (greed > minGreed && spacer < maxSpacer) {
		// We calculate a max depth based on the spacer, then add one as a buffer.
		const depth = Math.ceil(wTime / (4 * spacer)) + 1;
		const amount = maxMoney * greed;
		const hThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(metrics.target, amount)), 1);
		const tGreed = hPercent * hThreads;
		const gThreads = Math.ceil(ns.growthAnalyze(metrics.target, maxMoney / (maxMoney - maxMoney * tGreed)) * 1.01);
		if (Math.max(hThreads, gThreads) <= maxThreads) {
			const wThreads1 = Math.max(Math.ceil(hThreads * 0.002 / 0.05), 1);
			const wThreads2 = Math.max(Math.ceil(gThreads * 0.004 / 0.05), 1);

			const threadCosts = [hThreads * 1.7, wThreads1 * 1.75, gThreads * 1.75, wThreads2 * 1.75];

			// Glad I kept these, they turned out to be useful after all. When trying to hit target depth, 
			// checking that there's actually enough theoretical ram to fit them is a massive boost to performance.
			const totalCost = threadCosts.reduce((t, c) => t + c) * depth;
			if (totalCost < ramNet.totalRam) {
				// Double check that we can actually fit our threads into ram, then set our metrics and return.
				const batchCount = ramNet.testThreads(threadCosts);
				if (batchCount >= depth) {
					metrics.spacer = spacer;
					metrics.greed = greed;
					metrics.depth = depth;
					return
				}
			}
		}
		// await ns.sleep(0); // Uncomment and make the function async if you don't like the freeze on startup.

		// Decrement greed until we hit the minimum, then reset and increment spacer. We'll find a valid configuration eventually.
		greed -= stepValue;
		if (greed < minGreed && spacer < maxSpacer) {
			greed = 0.99;
			++spacer;
		}
	}
	throw new Error("Not enough ram to run even a single batch. Something has gone seriously wrong.");
}