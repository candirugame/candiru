const decoder = new TextDecoder();

// Define function to execute shell commands
async function runCommand(cmdArray: string[]): Promise<string> {
    const command = new Deno.Command(cmdArray[0], {
        args: cmdArray.slice(1),
        stdout: "piped",
        stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
        const errorText = decoder.decode(stderr);
        throw new Error(errorText);
    }

    const output = decoder.decode(stdout).trim();
    return output;
}

try {
    // Fetch the latest tag, including beta versions
    let version = await runCommand(["git", "describe", "--tags", "--abbrev=0"]);

    // Ensure the version string is valid
    if (!version) {
        throw new Error("No Git tags found. Please ensure you have at least one tag.");
    }

    // Create the public directory if it doesn't exist
    await Deno.mkdir("public", { recursive: true });

    // Write the version to gameVersion.json
    const versionData = JSON.stringify({ version });
    await Deno.writeTextFile("public/gameVersion.json", versionData);

    console.log(`Generated gameVersion.json with version: ${version}`);
} catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
        errorMessage = error.message;
    } else if (typeof error === "string") {
        errorMessage = error;
    }
    console.error("Error generating gameVersion.json:", errorMessage);

    // Optional: Use commit hash as a fallback
    try {
        const commitHash = await runCommand(["git", "rev-parse", "--short", "HEAD"]);
        const version = `commit-${commitHash}`;
        await Deno.mkdir("public", { recursive: true });
        const versionData = JSON.stringify({ version });
        await Deno.writeTextFile("public/gameVersion.json", versionData);
        console.log(`Generated gameVersion.json with commit hash: ${version}`);
    } catch (innerError) {
        let innerErrorMessage = "Unknown error";
        if (innerError instanceof Error) {
            innerErrorMessage = innerError.message;
        } else if (typeof innerError === "string") {
            innerErrorMessage = innerError;
        }
        console.error("Unable to determine version. Please ensure Git is installed and tags are available.");
        console.error("Inner error:", innerErrorMessage);
        Deno.exit(1);
    }
}