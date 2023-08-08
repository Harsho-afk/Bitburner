import { calcBestRam } from "utils.js";

/** @param {NS} ns **/
export async function main(ns, numServers = ns.args[0], greedy = (ns.args[1]==undefined)?false:ns.args[1]) {
    if (greedy) {
        ns.scriptKill("stockTrader.js", "home");
    }
    const ram = calcBestRam(ns, numServers);
    if (ram == undefined) {
        return;
    }
    let servers = ns.getPurchasedServers();
    let count = 0;
    let cost;
    if (servers.length >= ns.getPurchasedServerLimit()) {
        if (ram == ns.getServerMaxRam(servers[0])) {
            return;
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
}