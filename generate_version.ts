const version = Deno.env.get('APP_VERSION') || 'unknown';

try {
    // Create the public directory if it doesn't exist
    await Deno.mkdir("public", { recursive: true });

    // Write the version to gameVersion.json
    const versionData = JSON.stringify({ version });
    await Deno.writeTextFile("public/gameVersion.json", versionData);

    console.log(`Generated gameVersion.json with version: ${version}`);
} catch (error) {
    console.log("An error occurred while generating gameVersion.json, skipping version generation.");
    Deno.exit(0); // Quietly exit without causing issues
}
