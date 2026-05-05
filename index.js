const fs = require('fs');
const cron = require('node-cron');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;
const CONFIG_URL = 'https://raw.githubusercontent.com/reisxd/TizenBrew/refs/heads/main/tizenbrew-app/TizenBrew/service-nextgen/service/utils/configuration.js';

async function fetchAndEvalConfig() {
    const res = await fetch(CONFIG_URL);
    const code = await res.text();

    const defaultConfigMatch = code.match(/return \{([\s\S]*?)\};/);
    if (!defaultConfigMatch) throw new Error('Could not parse default config from upstream');

    return eval(`({${defaultConfigMatch[1]}})`);
}

async function updateModules() {
    console.log(`[${new Date().toISOString()}] Fetching upstream configuration...`);

    try {
        const config = await fetchAndEvalConfig();
        const newModulesData = { modules: config.modules };

        fs.writeFileSync('./modules.json', JSON.stringify(newModulesData, null, 4));
        console.log(`[${new Date().toISOString()}] Successfully updated modules.json!`);
        return true;
    } catch (e) {
        console.error(`[${new Date().toISOString()}] Failed to update modules:`, e.message);
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const runOnce = args.includes('--run-once');

    if (runOnce) {
        console.log("Running in one-off mode...");
        const success = await updateModules();
        if (!success) process.exit(1);
        process.exit(0);
    } else {
        console.log("Starting TizenBrew Module Updater and Web Server...");

        await updateModules();
        cron.schedule('0 * * * *', () => {
            updateModules();
        });

        app.use(express.static(__dirname));
        app.listen(PORT, () => {
            console.log(`Web server is actively listening on port ${PORT}...`);
            console.log(`You can now view your page at http://localhost:${PORT}`);
        });
    }
}

main();