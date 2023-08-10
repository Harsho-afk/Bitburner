/** @param {NS} ns */
export async function main(ns, info = JSON.parse(ns.args[0])) {
    let delay = info.end - info.time - Date.now();
    if (delay < 0) {
        ns.tprint(`WARN: Batch ${info.batch} ${info.type} was ${-delay}ms late.\n`);
        ns.writePort(ns.pid, -delay);
        delay = 0;
    } else {
        ns.writePort(ns.pid, 0);
    }
    await ns.hack(info.target, { additionalMsec: delay });
    ns.atExit(() => {
        if (info.report) ns.writePort(info.port, info.type + info.server);
    })
}