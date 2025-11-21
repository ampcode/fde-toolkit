import { type GitLabConfig, fetchFromGitLabAPI } from '../api-client'

export type GitLabSearchArgs = {
	project: string
	query: string
	path?: string
	limit?: number
	offset?: number
}

export const toolDefinition = {
	name: 'search_code',
	description: `Search for code in a GitLab project.

PARAMETERS:
- project: The GitLab project path (e.g., "group/project" or URL)
- query: Search query - keywords to find in code (required)
- path: Optional path to limit search to specific directory
- limit: Maximum results (default: 25)
- offset: Number of results to skip (default: 0)

Returns matching files with code snippets.`,
	inputSchema: {
		type: 'object',
		properties: {
			project: {
				type: 'string',
				description: 'The GitLab project path (e.g., "group/project") or full URL',
			},
			query: {
				type: 'string',
				description: 'Search query - keywords to find in code',
			},
			path: {
				type: 'string',
				description: 'Optional path to limit search to specific directory',
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results (default: 25)',
			},
			offset: {
				type: 'number',
				description: 'Number of results to skip (default: 0)',
			},
		},
		required: ['project', 'query'],
	},
} as const

interface GitLabSearchItem {
	path: string
	basename: string
	ref: string
	startline: number
	project_id: number
	data: string
}

export type SearchResult = {
	file: string
	chunks: string[]
}

export type GitLabSearchResult = {
	results: SearchResult[]
	totalCount: number
}

function extractProjectPath(project: string): string {
	return project.replace(/\.git$/, '').replace(/^https?:\/\/[^/]+\//, '')
}

export async function searchCode(
	args: GitLabSearchArgs,
	config: GitLabConfig,
	onProgress?: (message: string) => void,
): Promise<GitLabSearchResult> {
	const { project, query, path, limit = 25, offset = 0 } = args

	const projectPath = extractProjectPath(project)
	const encodedProjectPath = encodeURIComponent(projectPath)

	onProgress?.(`Searching for "${query}" in ${projectPath}...`)

	// Calculate pagination
	const perPage = Math.min(limit, 100)
	const page = Math.floor(offset / perPage) + 1

	// Build search endpoint - GitLab project-scoped search
	let apiPath = `projects/${encodedProjectPath}/search?scope=blobs&search=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`

	// Add path filter if provided
	if (path && path !== '.') {
		apiPath += `&filename=${encodeURIComponent(path)}`
	}

	const response = await fetchFromGitLabAPI<GitLabSearchItem[]>(apiPath, {}, config)

	if (!response.ok) {
		throw new Error(
			`Failed to search code: ${response.status} ${response.statusText || 'Unknown error'}`,
		)
	}

	const data = response.data || []

	if (data.length === 0) {
		return {
			results: [],
			totalCount: 0,
		}
	}

	// Group results by file
	const fileMap = new Map<string, string[]>()

	for (const item of data) {
		const absPath = `/${projectPath}/${item.path}`

		if (!fileMap.has(absPath)) {
			fileMap.set(absPath, [])
		}

		const chunks = fileMap.get(absPath)!

		// Process data content with truncation
		if (item.data) {
			let fragment = item.data.trim()

			if (fragment.length > 2048) {
				fragment = `${fragment.slice(0, 2048)}... (truncated)`
			}

			chunks.push(fragment)
		}
	}

	// Convert map to structured results
	const results: SearchResult[] = Array.from(fileMap.entries()).map(([file, chunks]) => ({
		file,
		chunks,
	}))

	return {
		results,
		totalCount: data.length,
	}
}
