import axios, { isAxiosError } from 'axios'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as PackageJSON from '../package.json'

type Workflow = {
  id: number
  name: string
  path: string
}

//
// Main task function (async wrapper)
//
async function run(): Promise<void> {
  core.info(`🏃 Workflow Dispatch Action v${PackageJSON.version}`)
  try {
    await validateSubscription()

    // Required inputs
    const workflowRef = core.getInput('workflow')

    // Optional inputs, with defaults
    const token = core.getInput('token')
    const ref = core.getInput('ref') || github.context.ref
    const [owner, repo] = core.getInput('repo')
      ? core.getInput('repo').split('/')
      : [github.context.repo.owner, github.context.repo.repo]

    // Decode inputs, this MUST be a valid JSON string
    let inputs = {}
    const inputsJson = core.getInput('inputs')
    if(inputsJson) {
      inputs = JSON.parse(inputsJson)
    }

    // Get octokit client for making API calls
    const octokit = github.getOctokit(token)

    // List workflows via API, and handle paginated results
    const workflows: Workflow[] = await octokit.paginate(
      octokit.rest.actions.listRepoWorkflows.endpoint.merge({ owner, repo, ref, inputs })
    )

    // Debug response if ACTIONS_STEP_DEBUG is enabled
    core.debug('### START List Workflows response data')
    core.debug(JSON.stringify(workflows, null, 3))
    core.debug('### END:  List Workflows response data')

    // Locate workflow either by name, id or filename
    const foundWorkflow = workflows.find((workflow) => {
      return workflow.name === workflowRef ||
        workflow.id.toString() === workflowRef ||
        workflow.path.endsWith(workflowRef)
    })

    if(!foundWorkflow) throw new Error(`Unable to find workflow '${workflowRef}' in ${owner}/${repo} 😥`)

    console.log(`🔎 Found workflow, id: ${foundWorkflow.id}, name: ${foundWorkflow.name}, path: ${foundWorkflow.path}`)

    // Call workflow_dispatch API
    console.log('🚀 Calling GitHub API to dispatch workflow...')
    const dispatchResp = await octokit.request(`POST /repos/${owner}/${repo}/actions/workflows/${foundWorkflow.id}/dispatches`, {
      ref: ref,
      inputs: inputs
    })

    core.info(`🏆 API response status: ${dispatchResp.status}`)
    core.setOutput('workflowId', foundWorkflow.id)
  } catch (error) {
    const e = error as Error

    if(e.message.endsWith('a disabled workflow')){
      core.warning('Workflow is disabled, no action was taken')
      return
    }

    core.setFailed(e.message)
  }
}

async function validateSubscription(): Promise<void> {
  const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`

  try {
    await axios.get(API_URL, { timeout: 3000 })
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      core.error(
        'Subscription is not valid. Reach out to support@stepsecurity.io'
      )
      process.exit(1)
    } else {
      core.info('Timeout or API not reachable. Continuing to next step.')
    }
  }
}

//
// Call the main task run function
//
run()
