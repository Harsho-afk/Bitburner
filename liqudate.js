/** @param {NS} ns */
export async function main(ns) {
    let stocks = ns.stock.getSymbols();
    let shortUnlock = false;
    for(const stock of stocks) {
        let position = ns.stock.getPosition(stock);
        if(position[0] > 0) {
            ns.stock.sellStock(stock,position[0]);
        }
        if(shortUnlock) {
            if(position[2] > 0) {
                ns.stock.sellShort(stock,position[2]);
            }
        }
    }
    
}