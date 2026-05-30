use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Incident {
    pub id: String,
    pub title: String,
    pub status: String,
    pub severity: String,
    pub impact: String,
    pub mitigation: String,
    pub pending_actions: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct Evidence {
    pub id: String,
    pub incident_id: String,
    pub kind: String,
    pub source: String,
    pub content_text: Option<String>,
    pub content_hash: String,
    pub created_at: String,
    pub metadata_json: String,
    pub attachment_id: Option<String>,
}

#[derive(Serialize)]
pub struct AttachmentData {
    pub name: String,
    pub mime_type: String,
    pub base64: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct TimelineEvent {
    pub id: String,
    pub incident_id: String,
    pub timestamp: String,
    pub title: String,
    pub description: String,
    pub confidence: f64,
    pub source_evidence_id: Option<String>,
    pub source_parser_output_id: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Entity {
    pub id: String,
    pub incident_id: String,
    pub entity_type: String,
    pub name: String,
    pub confidence: f64,
    pub source_evidence_id: Option<String>,
    pub source_parser_output_id: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Tag {
    pub id: String,
    pub incident_id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct ParserOutput {
    pub id: String,
    pub evidence_id: String,
    pub parser_name: String,
    pub parser_version: String,
    pub output_json: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Job {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub payload_json: String,
    pub error_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct Snapshot {
    pub incidents: Vec<Incident>,
    pub evidence: Vec<Evidence>,
    pub timeline_events: Vec<TimelineEvent>,
    pub entities: Vec<Entity>,
    pub tags: Vec<Tag>,
    pub parser_outputs: Vec<ParserOutput>,
    pub jobs: Vec<Job>,
}

#[derive(Deserialize)]
pub struct CreateEvidenceInput {
    pub incident_id: String,
    pub kind: String,
    pub source: String,
    pub content_text: Option<String>,
    pub metadata_json: Option<String>,
    pub attachment_name: Option<String>,
    pub attachment_mime_type: Option<String>,
    pub attachment_base64: Option<String>,
}

#[derive(Deserialize)]
pub struct ParserOutputInput {
    pub id: String,
    pub evidence_id: String,
    pub parser_name: String,
    pub parser_version: String,
    pub output_json: String,
    pub timeline_events_json: String,
    pub entities_json: String,
}

#[derive(Deserialize)]
pub struct CreateJobInput {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub payload_json: String,
}

#[derive(Deserialize)]
pub struct UpdateJobInput {
    pub id: String,
    pub status: String,
    pub error_text: Option<String>,
}

#[derive(Deserialize)]
pub struct ManualTimelineInput {
    pub incident_id: String,
    pub timestamp: String,
    pub title: String,
    pub description: String,
    pub source_evidence_id: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateTimelineInput {
    pub id: String,
    pub timestamp: String,
    pub title: String,
    pub description: String,
    pub source_evidence_id: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateIncidentOpsInput {
    pub incident_id: String,
    pub status: String,
    pub severity: String,
    pub impact: String,
    pub mitigation: String,
    pub pending_actions: String,
}

#[derive(Deserialize)]
pub struct DerivedTimelineInput {
    pub id: String,
    pub incident_id: String,
    pub timestamp: String,
    pub title: String,
    pub description: String,
    pub confidence: f64,
    pub source_evidence_id: String,
    pub source_parser_output_id: String,
}

#[derive(Deserialize)]
pub struct DerivedEntityInput {
    pub id: String,
    pub incident_id: String,
    pub entity_type: String,
    pub name: String,
    pub confidence: f64,
    pub source_evidence_id: String,
    pub source_parser_output_id: String,
}
