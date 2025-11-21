import { type GitLabConfig, fetchFromGitLabAPI } from '../api-client'

export type GitLabListProjectsArgs = {
	search?: string
	limit?: number
	offset?: number
}

export const toolDefinition = {
	name: 'list_projects',
	description: `List or search GitLab projects.

PARAMETERS:
- search: Optional search query to filter projects by name
- limit: Maximum number of results (default: 30)
- offset: Number of results to skip (default: 0)

Returns list of projects with metadata.`,
	inputSchema: {
		type: 'object',
		properties: {
			search: {
				type: 'string',
				description: 'Optional search query to filter projects by name',
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results (default: 30)',
			},
			offset: {
				type: 'number',
				description: 'Number of results to skip (default: 0)',
			},
		},
		required: [],
	},
} as const

interface GitLabProject {
	id: number
	name: string
	path_with_namespace: string
	description: string | null
	web_url: string
	default_branch: string
	visibility: string
	last_activity_at: string
}

export type ProjectInfo = {
	id: number
	name: string
	path: string
	description: string | null
	url: string
	defaultBranch: string
	visibility: string
	lastActivity: string
}

export async function listProjects(
	args: GitLabListProjectsArgs,
	config: GitLabConfig,
	onProgress?: (message: string) => void,
): Promise<ProjectInfo[]> {
	const { search, limit = 30, offset = 0 } = args

	onProgress?.(`Listing GitLab projects${search ? ` matching "${search}"` : ''}...`)

	// Calculate pagination
	const perPage = Math.min(limit, 100)
	const page = Math.floor(offset / perPage) + 1

	// Build API path
	let apiPath = `projects?per_page=${perPage}&page=${page}&order_by=last_activity_at&sort=desc`

	if (search) {
		apiPath += `&search=${encodeURIComponent(search)}`
	}

	const response = await fetchFromGitLabAPI<GitLabProject[]>(apiPath, {}, config)

	if (!response.ok || !response.data) {
		throw new Error(
			`Failed to list projects: ${response.status} ${response.statusText || 'Unknown error'}`,
		)
	}

	return response.data.map((project) => ({
		id: project.id,
		name: project.name,
		path: project.path_with_namespace,
		description: project.description,
		url: project.web_url,
		defaultBranch: project.default_branch,
		visibility: project.visibility,
		lastActivity: project.last_activity_at,
	}))
}
