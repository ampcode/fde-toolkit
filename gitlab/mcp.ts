#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import type { GitLabConfig } from './api-client'
import { globFiles, type GitLabGlobArgs, toolDefinition as globFilesTool } from './tools/glob'
import {
	listDirectory,
	type GitLabListDirectoryArgs,
	toolDefinition as listDirectoryTool,
} from './tools/list_directory'
import {
	listProjects,
	type GitLabListProjectsArgs,
	toolDefinition as listProjectsTool,
} from './tools/list_projects'
import { readFile, type GitLabReadArgs, toolDefinition as readFileTool } from './tools/read'
import { searchCode, type GitLabSearchArgs, toolDefinition as searchCodeTool } from './tools/search'

const GITLAB_INSTANCE_URL = process.env.GITLAB_INSTANCE_URL || 'https://gitlab.com'
const GITLAB_ACCESS_TOKEN = process.env.GITLAB_ACCESS_TOKEN

if (!GITLAB_ACCESS_TOKEN) {
	console.error('Error: GITLAB_ACCESS_TOKEN must be set')
	process.exit(1)
}

const config: GitLabConfig = {
	baseURL: GITLAB_INSTANCE_URL,
	token: GITLAB_ACCESS_TOKEN,
}

const server = new Server(
	{
		name: 'gitlab-server',
		version: '1.0.0',
	},
	{
		capabilities: {
			tools: {},
		},
	},
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [readFileTool, searchCodeTool, listProjectsTool, globFilesTool, listDirectoryTool],
	}
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	try {
		switch (request.params.name) {
			case 'read_file': {
				const args = request.params.arguments as GitLabReadArgs
				const result = await readFile(args, config)
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				}
			}

			case 'search_code': {
				const args = request.params.arguments as GitLabSearchArgs
				const result = await searchCode(args, config)
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				}
			}

			case 'list_projects': {
				const args = request.params.arguments as GitLabListProjectsArgs
				const result = await listProjects(args, config)
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				}
			}

			case 'glob_files': {
				const args = request.params.arguments as GitLabGlobArgs
				const result = await globFiles(args, config)
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				}
			}

			case 'list_directory': {
				const args = request.params.arguments as GitLabListDirectoryArgs
				const result = await listDirectory(args, config)
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				}
			}

			default:
				throw new Error(`Unknown tool: ${request.params.name}`)
		}
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: `Error: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
			isError: true,
		}
	}
})

async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error('GitLab MCP Server running on stdio')
}

main().catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
