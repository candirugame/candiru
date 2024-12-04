module.exports = {
    branches: [
        'main',
        { name: 'dev', prerelease: 'beta' },
    ],
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        [
            '@semantic-release/github',
            {
                successComment: false,
            },
        ],
        ...(process.env.GITHUB_REF_NAME === 'main' ? [
            [
                'semantic-release-replace-plugin',
                {
                    replacements: [
                        {
                            files: ['public/gameVersion.json'],
                            from: '"version": ".*"',
                            to: '"version": "${nextRelease.version}"',
                            countMatches: true,
                        },
                    ],
                },
            ],
            [
                '@semantic-release/git',
                {
                    assets: ['public/gameVersion.json'],
                    message: 'chore: release ${nextRelease.version} [skip ci]',
                },
            ],
        ] : []),
    ],
};
