const decoder = new TextDecoder();

async function runCommand(cmdArray: string[]): Promise<string | null> {
    try {
        const command = new Deno.Command(cmdArray[0], {
            args: cmdArray.slice(1),
            stdout: "piped",
            stderr: "piped",
        });
        const { code, stdout, stderr } = await command.output();
        if (code !== 0) {
            throw new Error(decoder.decode(stderr));
        }
        return decoder.decode(stdout).trim();
    } catch (error) {
        return null;
    }
}

try {
    // Try to get the latest Git tag
    const version = await runCommand(["git", "describe", "--tags", "--abbrev=0"]);

    // If no tag is found or Git is unavailable, log and exit quietly
    if (!version) {
        console.log("No Git tags found or Git is unavailable. Skipping version generation.");//
    }

    // Create the public directory if it doesn't exist
    await Deno.mkdir("public", { recursive: true });

    // Write the version to gameVersion.json
    const versionData = JSON.stringify({ version });
    await Deno.writeTextFile("public/gameVersion.json", versionData);

    console.log(`Generated gameVersion.json with version: ${version}`);
} catch (error) {
    console.log("An error occurred while generating gameVersion.json, skipping version generation.");
}