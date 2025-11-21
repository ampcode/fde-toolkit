import picomatch from 'picomatch/posix'

import { type GitLabConfig, fetchFromGitLabAPI } from '../api-client'

export type GitLabGlobArgs = {
	project: string
	filePattern: string
	limit?: number
	offset?: number
}

export const toolDefinition = {
	name: 'glob_files',
	description: `Find files matching a glob pattern in a GitLab project.

PARAMETERS:
- project: The GitLab project path (e.g., "group/project" or URL)
- filePattern: Glob pattern to match files (required, e.g., "**/*.ts")
- limit: Maximum results (default: 100)
- offset: Number of results to skip (default: 0)

Returns list of file paths matching the pattern.`,
	inputSchema: {
		type: 'object',
		properties: {
			project: {
				type: 'string',
				description: 'The GitLab project path (e.g., "group/project") or full URL',
			},
			filePattern: {
				type: 'string',
				description: 'Glob pattern to match files (e.g., "**/*.ts")',
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results (default: 100)',
			},
			offset: {
				type: 'number',
				description: 'Number of results to skip (default: 0)',
			},
		},
		required: ['project', 'filePattern'],
	},
} as const

interface GitLabTreeItem {
	path: string
	type: 'blob' | 'tree'
	mode: string
	id: string
}

function extractProjectPath(project: string): string {
	// Handle full URLs like https://gitlab.com/group/project
	return project.replace(/\.git$/, '').replace(/^https?:\/\/[^/]+\//, '')
}

export async function globFiles(
	args: GitLabGlobArgs,
	config: GitLabConfig,
	onProgress?: (message: string) => void,
): Promise<string[]> {
	const { project, filePattern, limit = 100, offset = 0 } = args

	const projectPath = extractProjectPath(project)
	const encodedProjectPath = encodeURIComponent(projectPath)

	onProgress?.(`Finding files matching "${filePattern}" in ${projectPath}...`)

	// Use GitLab API recursive tree endpoint
	const apiPath = `projects/${encodedProjectPath}/repository/tree?recursive=true&per_page=100`

	const allFiles: string[] = []
	let page = 1
	let hasMore = true

	// Paginate through all results
	while (hasMore) {
		const response = await fetchFromGitLabAPI<GitLabTreeItem[]>(
			`${apiPath}&page=${page}`,
			{},
			config,
		)

		if (!response.ok || !response.data) {
			if (page === 1) {
				throw new Error(
					`Failed to fetch files: ${response.status} ${response.statusText || 'Unknown error'}`,
				)
			}
			break
		}

		// Filter to only include file entries (blobs)
		const files = response.data.filter((item) => item.type === 'blob').map((item) => item.path)
		allFiles.push(...files)

		// Check if there are more pages
		hasMore = response.data.length === 100
		page++
	}

	// Apply glob pattern matching
	const isMatch = picomatch(filePattern)
	const matchedFiles = allFiles.filter((p) => isMatch(p))

	// Apply pagination
	const paginatedFiles = limit
		? matchedFiles.slice(offset, offset + limit)
		: matchedFiles.slice(offset)

	// Return paths with project prefix
	return paginatedFiles.map((path) => `/${projectPath}/${path}`)
}
