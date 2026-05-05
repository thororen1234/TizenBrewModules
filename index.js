const fs = require('fs');
const cron = require('node-cron');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;
const CONFIG_URL = 'https://raw.githubusercontent.com/reisxd/TizenBrew/refs/heads/main/tizenbrew-app/TizenBrew/service-nextgen/service/utils/configuration.js';

async function fetchAndEvalConfig() {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) throw new Error(`Failed to fetch upstream config: HTTP ${res.status} ${res.statusText}`);
    const code = await res.text();
    const defaultConfigMatch = code.match(/return \{([\s\S]*?)\};/);
    if (!defaultConfigMatch) throw new Error('Could not parse default config from upstream');
    return eval(`({${defaultConfigMatch[1]}})`);
}

async function updateModules() {
    console.log(`\n[${new Date().toISOString()}] Fetching upstream configuration...`);

    try {
        const config = await fetchAndEvalConfig();
        const upstreamModules = config.modules || [];
        let existingModules = [];

        if (fs.existsSync('./modules.json')) {
            try {
                const fileData = fs.readFileSync('./modules.json', 'utf8');
                const parsedData = JSON.parse(fileData);
                if (Array.isArray(parsedData.modules)) {
                    existingModules = parsedData.modules;
                }
            } catch (err) {
                console.warn(`[${new Date().toISOString()}] Warning: Could not parse existing modules.json.`);
            }
        }

        let combined = [...existingModules, ...upstreamModules];

        for (let i = 0; i < combined.length; i++) {
            let mod = combined[i];

            if (typeof mod === 'object' && mod !== null && mod.githubRepo) {
                try {
                    const res = await fetch(`https://api.github.com/repos/${mod.githubRepo}/releases/latest`, {
                        headers: {
                            'User-Agent': 'TizenBrew-Registry-Server',
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });

                    if (res.ok) {
                        const release = await res.json();

                        const cleanVersion = release.tag_name.replace(/^v/, '');
                        const fileName = mod.fileName || `${mod.appName}.${mod.packageType}`;

                        mod.version = cleanVersion;
                        mod.fullName = `https://github.com/${mod.githubRepo}/releases/download/${release.tag_name}/${fileName}`;
                        console.log(`[GitHub API] Successfully synced ${mod.appName} to v${cleanVersion}`);
                    } else {
                        console.warn(`[GitHub API] Failed to fetch release for ${mod.githubRepo}: HTTP ${res.status}`);
                        if (!mod.fullName) {
                            mod.fullName = `https://github.com/${mod.githubRepo}/releases/latest`;
                            mod.version = "latest";
                        }
                    }
                } catch (e) {
                    console.error(`[GitHub API] Network error checking ${mod.githubRepo}:`, e.message);
                }
            }
        }
        const uniqueModulesMap = new Map();
        combined.forEach(mod => {
            if (typeof mod === 'string') {
                uniqueModulesMap.set(mod, mod);
            } else if (typeof mod === 'object' && mod.fullName) {
                uniqueModulesMap.set(mod.fullName, mod);
            } else if (typeof mod === 'object' && mod.githubRepo) {
                uniqueModulesMap.set(mod.githubRepo, mod);
            }
        });

        const mergedModules = Array.from(uniqueModulesMap.values());
        const newModulesData = { modules: mergedModules };

        fs.writeFileSync('./modules.json', JSON.stringify(newModulesData, null, 4));
        console.log(`[${new Date().toISOString()}] Successfully updated modules.json with ${mergedModules.length} total modules!`);
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
        cron.schedule('0 0 * * 0', () => {
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