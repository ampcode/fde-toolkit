import { type GitLabConfig, fetchFromGitLabAPI } from '../api-client'

export type GitLabReadArgs = {
	project: string
	path: string
	read_range?: [number, number]
}

export const toolDefinition = {
	name: 'read_file',
	description: `Read file contents from a GitLab project.

PARAMETERS:
- project: The GitLab project path (e.g., "group/project" or URL)
- path: The file path within the repository (required)
- read_range: Optional [startLine, endLine] to read only a portion of the file

Returns file contents with line numbers.`,
	inputSchema: {
		type: 'object',
		properties: {
			project: {
				type: 'string',
				description: 'The GitLab project path (e.g., "group/project") or full URL',
			},
			path: {
				type: 'string',
				description: 'The file path within the repository',
			},
			read_range: {
				type: 'array',
				description: 'Optional [startLine, endLine] to read only a portion',
				items: { type: 'number' },
				minItems: 2,
				maxItems: 2,
			},
		},
		required: ['project', 'path'],
	},
} as const

export type GitLabReadResult = {
	absolutePath: string
	content: string
}

function extractProjectPath(project: string): string {
	return project.replace(/\.git$/, '').replace(/^https?:\/\/[^/]+\//, '')
}

export async function readFile(
	args: GitLabReadArgs,
	config: GitLabConfig,
	onProgress?: (message: string) => void,
): Promise<GitLabReadResult> {
	const { project, path, read_range } = args

	const projectPath = extractProjectPath(project)
	const encodedProjectPath = encodeURIComponent(projectPath)

	onProgress?.(`Reading file "${path}" from ${projectPath}...`)

	// Normalize the path
	let relativePath = path

	// Remove file:// prefix if present
	if (relativePath.startsWith('file://')) {
		relativePath = relativePath.slice(7)
	}

	// Remove project prefix if present
	if (relativePath.startsWith(`/${projectPath}`)) {
		relativePath = relativePath.slice(`/${projectPath}`.length)
	}

	// Remove leading slash
	if (relativePath.startsWith('/')) {
		relativePath = relativePath.slice(1)
	}

	// URL encode the file path for the API
	const encodedFilePath = encodeURIComponent(relativePath)

	// Use GitLab API to read raw file contents
	const apiPath = `projects/${encodedProjectPath}/repository/files/${encodedFilePath}/raw`

	const response = await fetchFromGitLabAPI<string>(apiPath, {}, config)

	if (!response.ok) {
		throw new Error(
			`Failed to read file: ${response.status} ${response.statusText || 'Unknown error'}`,
		)
	}

	// GitLab returns raw file content as text
	const content = response.text || ''

	// Split content into lines
	const lines = content.split('\n')

	// Apply read_range if specified
	let startLine = 1
	let endLine = lines.length

	if (read_range) {
		startLine = Math.max(1, read_range[0])
		endLine = Math.min(lines.length, read_range[1])
	}

	// Check if content is too large
	const selectedLines = lines.slice(startLine - 1, endLine)
	const selectedContent = selectedLines.join('\n')
	const contentSize = Buffer.byteLength(selectedContent, 'utf8')

	if (contentSize > 128 * 1024) {
		throw new Error(
			`File is too large (${Math.round(contentSize / 1024)}KB). The file has ${lines.length} lines. Please retry with a smaller read_range parameter.`,
		)
	}

	// Create line-numbered content
	const numberedLines = selectedLines.map((line, idx) => `${startLine + idx}: ${line}`).join('\n')

	return {
		absolutePath: `/${projectPath}/${relativePath}`,
		content: numberedLines,
	}
}
