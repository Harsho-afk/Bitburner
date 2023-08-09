//source - https://github.com/DarkTechnomancer/darktechnomancer.github.io/tree/main/Part%204%3A%20Periodic
/** @param {NS} ns */
export async function main(ns) {
	const start = performance.now();
	const port = ns.getPortHandle(ns.pid);
	const job = JSON.parse(ns.args[0]);
	let tDelay = 0;
	let delay = job.end - job.time - Date.now();
	if (delay < 0) {
		ns.tprint(`WARN: Batch ${job.batch} ${job.type} was ${-delay}ms late. (${job.end})\n`);
		tDelay = -delay
		delay = 0;
	}
	const promise = ns.grow(job.target, { additionalMsec: delay });
	tDelay += performance.now() - start;
	port.write(tDelay);
	await promise;

	ns.atExit(() => {
		if (job.report) ns.writePort(job.port, job.type + job.batch);
	});
}