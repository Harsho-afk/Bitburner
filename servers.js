import { calcBestRam } from "utils.js";

/** @param {NS} ns **/
export async function main(ns, numServers = ns.args[0]) {
    while (true) {
        let run = false;
        if (ns.scriptRunning("stockmaster.js", "home")) {
            run = true;
            ns.run("stockmaster.js", 1, "-l");
        }
        await ns.sleep(1000);
        let servers = ns.getPurchasedServers();
        let cost;
        const ram = calcBestRam(ns, numServers);
        if (ram == undefined) {
            if (run) ns.run("stockmaster.js");
            await ns.sleep(10 * 60 * 1000);
            continue;
        }
        let count = 0;
        if (servers.length >= ns.getPurchasedServerLimit()) {
            if (ram == ns.getServerMaxRam(servers[0])) {
                if (run) ns.run("stockmaster.js");
                await ns.sleep(10 * 60 * 1000);
                continue;
            }
            cost = ns.getPurchasedServerUpgradeCost(servers[0], ram);
            servers.forEach((f) => {
                if (ns.getServerMoneyAvailable("home") >= cost) {
                    ns.upgradePurchasedServer(f, ram);
                    count++;
                }
            });

            ns.tprint("Upgraded " + count + " server to " + ram + "GB. Total cost - " + ns.formatNumber(cost * count));
        } else {
            cost = ns.getPurchasedServerCost(ram);
            while (servers.length < ns.getPurchasedServerLimit()) {
                if (ns.getServerMoneyAvailable("home") >= cost) {
                    let host = "pserv-" + ns.getPurchasedServers().length;
                    ns.purchaseServer(host, ram);
                    servers = ns.getPurchasedServers();
                    count++;
                }
            }

            ns.tprint("Bought " + count + " server of " + ram + "GB. Total cost - " + ns.formatNumber(cost * count));
        }
        if (run) ns.run("stockmaster.js");
        await ns.sleep(10 * 60 * 1000);
    }
}