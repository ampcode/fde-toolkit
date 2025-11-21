import { type GitLabConfig, fetchFromGitLabAPI } from '../api-client'

export type GitLabListDirectoryArgs = {
	project: string
	path?: string
	limit?: number
}

export const toolDefinition = {
	name: 'list_directory',
	description: `List the contents of a directory in a GitLab project.

PARAMETERS:
- project: The GitLab project path (e.g., "group/project" or URL)
- path: The directory path to list (default: root)
- limit: Maximum number of entries to return (default: 100)

Returns list of files and directories, with directories having a trailing slash.`,
	inputSchema: {
		type: 'object',
		properties: {
			project: {
				type: 'string',
				description: 'The GitLab project path (e.g., "group/project") or full URL',
			},
			path: {
				type: 'string',
				description: 'The directory path to list (default: root)',
			},
			limit: {
				type: 'number',
				description: 'Maximum number of entries to return (default: 100)',
			},
		},
		required: ['project'],
	},
} as const

interface GitLabTreeItem {
	name: string
	path: string
	type: 'blob' | 'tree'
}

function extractProjectPath(project: string): string {
	return project.replace(/\.git$/, '').replace(/^https?:\/\/[^/]+\//, '')
}

export async function listDirectory(
	args: GitLabListDirectoryArgs,
	config: GitLabConfig,
	onProgress?: (message: string) => void,
): Promise<string[]> {
	const { project, path = '', limit = 100 } = args

	const projectPath = extractProjectPath(project)
	const encodedProjectPath = encodeURIComponent(projectPath)

	onProgress?.(`Listing directory "${path || '/'}" in ${projectPath}...`)

	// Build API path - GitLab tree endpoint with optional path filter
	let apiPath = `projects/${encodedProjectPath}/repository/tree?per_page=${limit}`
	if (path && path !== '.' && path !== '/') {
		apiPath += `&path=${encodeURIComponent(path)}`
	}

	const response = await fetchFromGitLabAPI<GitLabTreeItem[]>(apiPath, {}, config)

	if (!response.ok || !response.data) {
		throw new Error(
			`Failed to list directory: ${response.status} ${response.statusText || 'Unknown error'}`,
		)
	}

	// Format entries: directories get trailing slash
	const entries = response.data.map((item) => {
		return item.type === 'tree' ? `${item.name}/` : item.name
	})

	// Sort: directories first, then alphabetically
	entries.sort((a, b) => {
		const aIsDir = a.endsWith('/')
		const bIsDir = b.endsWith('/')
		if (aIsDir && !bIsDir) return -1
		if (!aIsDir && bIsDir) return 1
		return a.localeCompare(b)
	})

	return entries
}
