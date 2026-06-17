import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";

/**
 * Placeholder for Phase 3 ingestion pipeline.
 * Will handle Cold Start and Delta Sync background jobs triggered by GitHub webhooks.
 */
export class IngestionWorkflow extends WorkflowEntrypoint {
  async run(
    _event: WorkflowEvent<unknown>,
    _step: WorkflowStep
  ): Promise<void> {
    // Phase 3: implement Cold Start and Delta Sync ingestion logic here.
  }
}
