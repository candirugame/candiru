// Utility for command autocomplete and filtering
export function getMatchingCommands(commandManager: any, input: string): string[] {
	const allCommands: string[] = commandManager['commands']?.map((c: { getCmdName: () => string }) => c.getCmdName()) ||
		[];
	if (!input || input === '/') {
		return allCommands.sort();
	}
	const prefix = input.slice(1).toLowerCase();
	return allCommands.filter((cmd: string) => cmd.startsWith(prefix)).sort();
}
