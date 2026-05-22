export const isoTimestamp =
	/\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
export const unixTimestamp = /\b1[6-9]\d{8}(?:\.\d{3})?\b/g;
export const rfcTimestamp =
	/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT\b/g;
export const logTimestamp =
	/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/g;
export const timeOnlyTimestamp = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
export const signalWords =
	/\b(deployed|deploy|deployment|rollback|rolled back|error|exception|timeout|timed out|5\d\d|4\d\d|latency|slow|OOMKilled|CrashLoopBackOff|failed|failure|panic|restart|restarted|unavailable|empty|disabled|null|success|p95|max|avg)\b/i;
export const servicePatterns = [
	/\bservice=([a-z0-9][a-z0-9._-]+)/gi,
	/\bapp=([a-z0-9][a-z0-9._-]+)/gi,
	/\b(?:service|app|component)[:\s]+([a-z0-9][a-z0-9._-]+)/gi,
	/\[([a-z][a-z0-9-]{2,})\]/gi,
];
export const httpPattern = /\b([1-5]\d\d)\b/g;
export const httpRequestPattern =
	/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+((?:https?:\/\/[^\s]+|\/[^\s?#]+)(?:[^\s]*)?)/gi;
export const latencyPattern =
	/\b(?:latency|duration|took|in)[:=\s]+(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds)\b/gi;
export const shortNumberPattern = /\b(\d+(?:\.\d+)?)\s*(k|m|ms|s|%)\b/gi;
export const labelPattern =
	/\b([a-z][a-z0-9_.-]*)\s*:\s*([a-z0-9_.\/-]+)\b/gi;
export const deployPattern =
	/\b(?:deploy(?:ed|ment)?|release|version|image|tag)[:=\s]+([a-z0-9._/@:-]+)\b/gi;
export const shaPattern = /\b(?:commit|sha)[:=\s]+([a-f0-9]{7,40})\b/gi;
export const semverPattern = /\bv?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?\b/gi;
export const kubernetesPatterns = [
	{
		type: "kubernetes_pod",
		pattern:
			/\bpod[\/=:\s]+([a-z0-9]([-a-z0-9]*[a-z0-9])?(?:-[a-f0-9]{8,10})?(?:-[a-z0-9]{5})?)\b/gi,
	},
	{
		type: "kubernetes_namespace",
		pattern: /\b(?:namespace|ns)[\/=:\s]+([a-z0-9]([-a-z0-9]*[a-z0-9])?)\b/gi,
	},
	{
		type: "kubernetes_deployment",
		pattern:
			/\b(?:deployment|deploy)[\/=:\s]+([a-z0-9]([-a-z0-9]*[a-z0-9])?)\b/gi,
	},
	{
		type: "kubernetes_node",
		pattern: /\bnode[\/=:\s]+([a-z0-9][a-z0-9.-]+)\b/gi,
	},
	{
		type: "kubernetes_reason",
		pattern:
			/\b(CrashLoopBackOff|OOMKilled|ImagePullBackOff|Evicted|Error|Completed)\b/g,
	},
];
export const slackUserPattern = /(?:^|\s)(?:@([a-z0-9._-]+)|<@([A-Z0-9]+)>)\//gi;
export const slackChannelPattern =
	/(?:^|\s)(?:#([a-z0-9._-]+)|<#([A-Z0-9]+)\|([^>]+)>)\//gi;
