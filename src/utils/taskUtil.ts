import { Task } from "./types/TaskIndex";

// Task identification
const TASK_REGEX = /^(([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\])\s*(.*)$/m;

// --- Emoji/Tasks Style Regexes ---
const EMOJI_START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_COMPLETED_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_CREATED_DATE_REGEX = /➕\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_RECURRENCE_REGEX = /🔁\s*(.*?)(?=\s(?:🗓️|🛫|⏳|✅|➕|🔁|@|#)|$)/u;
const EMOJI_PRIORITY_REGEX = /(([🔺⏫🔼🔽⏬️⏬])|(\[#[A-E]\]))/u; // Using the corrected variant selector
const EMOJI_CONTEXT_REGEX = /@([\w-]+)/g;
const EMOJI_TAG_REGEX =
	/#[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s]+/g; // Includes #project/ tags
const EMOJI_PROJECT_PREFIX = "#project/";

// --- Dataview Style Regexes ---
const DV_START_DATE_REGEX = /\[(?:start|🛫)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_COMPLETED_DATE_REGEX =
	/\[(?:completion|✅)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_DUE_DATE_REGEX = /\[(?:due|🗓️)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_SCHEDULED_DATE_REGEX = /\[(?:scheduled|⏳)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_CREATED_DATE_REGEX = /\[(?:created|➕)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_RECURRENCE_REGEX = /\[(?:repeat|recurrence|🔁)::\s*([^\]]+)\]/i;
const DV_PRIORITY_REGEX = /\[priority::\s*([^\]]+)\]/i;
const DV_PROJECT_REGEX = /\[project::\s*([^\]]+)\]/i;
const DV_CONTEXT_REGEX = /\[context::\s*([^\]]+)\]/i;
// Dataview Tag Regex is the same, applied after DV field removal
const ANY_DATAVIEW_FIELD_REGEX = /\[\w+(?:|🗓️|✅|➕|🛫|⏳|🔁)::\s*[^\]]+\]/gi;

// --- Priority Mapping --- (Combine from TaskParser)
const PRIORITY_MAP: Record<string, number> = {
	"🔺": 5,
	"⏫": 4,
	"🔼": 3,
	"🔽": 2,
	"⏬️": 1,
	"⏬": 1,
	"[#A]": 5,
	"[#B]": 4,
	"[#C]": 3, // Keep Taskpaper style? Maybe remove later
	"[#D]": 2,
	"[#E]": 1,
	highest: 5,
	high: 4,
	medium: 3,
	low: 2,
	lowest: 1,
	// Consider adding number string keys? e.g. "5": 5?
};

type MetadataFormat = "tasks" | "dataview"; // Define the type for clarity

// --- Helper function to parse date string ---
function parseLocalDate(dateString: string): number | undefined {
	if (!dateString) return undefined;
	const parts = dateString.split("-");
	if (parts.length === 3) {
		const year = parseInt(parts[0], 10);
		const month = parseInt(parts[1], 10); // 1-based month
		const day = parseInt(parts[2], 10);
		if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
			// Create Date object using UTC to avoid timezone shifts affecting the date part
			// Then get time. Or just use local date constructor if consistency is guaranteed.
			// Using local date constructor:
			return new Date(year, month - 1, day).getTime();
		}
	}
	console.warn(`Worker: Invalid date format encountered: ${dateString}`);
	return undefined;
}

// --- Refactored Metadata Extraction Functions ---

// Each function now takes task, content, and format, returns remaining content
// They modify the task object directly.

function extractDates(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";

	const tryParseAndAssign = (
		regex: RegExp,
		fieldName:
			| "dueDate"
			| "scheduledDate"
			| "startDate"
			| "completedDate"
			| "createdDate"
	): boolean => {
		if (task[fieldName] !== undefined) return false; // Already assigned

		const match = remainingContent.match(regex);
		if (match && match[1]) {
			const dateVal = parseLocalDate(match[1]);
			if (dateVal !== undefined) {
				task[fieldName] = dateVal; // Direct assignment is type-safe
				remainingContent = remainingContent.replace(match[0], "");
				return true;
			}
		}
		return false;
	};

	// Due Date
	if (useDataview) {
		!tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate") &&
			tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate");
	} else {
		!tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate") &&
			tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate");
	}

	// Scheduled Date
	if (useDataview) {
		!tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate") &&
			tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate");
	} else {
		!tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate") &&
			tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate");
	}

	// Start Date
	if (useDataview) {
		!tryParseAndAssign(DV_START_DATE_REGEX, "startDate") &&
			tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate");
	} else {
		!tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate") &&
			tryParseAndAssign(DV_START_DATE_REGEX, "startDate");
	}

	// Completion Date
	if (useDataview) {
		!tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate") &&
			tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate");
	} else {
		!tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate") &&
			tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate");
	}

	// Created Date
	if (useDataview) {
		!tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate") &&
			tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate");
	} else {
		!tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate") &&
			tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate");
	}

	return remainingContent;
}

function extractRecurrence(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_RECURRENCE_REGEX);
		if (match && match[1]) {
			task.recurrence = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try emoji format (primary or fallback)
	match = remainingContent.match(EMOJI_RECURRENCE_REGEX);
	if (match && match[1]) {
		task.recurrence = match[1].trim();
		remainingContent = remainingContent.replace(match[0], "");
	}

	return remainingContent;
}

function extractPriority(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_PRIORITY_REGEX);
		if (match && match[1]) {
			const priorityValue = match[1].trim().toLowerCase();
			const mappedPriority = PRIORITY_MAP[priorityValue];
			if (mappedPriority !== undefined) {
				task.priority = mappedPriority;
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			} else {
				const numericPriority = parseInt(priorityValue, 10);
				if (!isNaN(numericPriority)) {
					task.priority = numericPriority;
					remainingContent = remainingContent.replace(match[0], "");
					return remainingContent;
				}
			}
		}
	}

	// Try emoji format (primary or fallback)
	match = remainingContent.match(EMOJI_PRIORITY_REGEX);
	if (match && match[1]) {
		task.priority = PRIORITY_MAP[match[1]] ?? undefined;
		if (task.priority !== undefined) {
			remainingContent = remainingContent.replace(match[0], "");
		}
	}

	return remainingContent;
}

function extractProject(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_PROJECT_REGEX);
		if (match && match[1]) {
			task.project = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try #project/ prefix (primary or fallback)
	const projectTagRegex = new RegExp(EMOJI_PROJECT_PREFIX + "([\\w/-]+)");
	match = remainingContent.match(projectTagRegex);
	if (match && match[1]) {
		task.project = match[1].trim();
		// Do not remove here; let tag extraction handle it
	}

	return remainingContent;
}

function extractContext(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_CONTEXT_REGEX);
		if (match && match[1]) {
			task.context = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Skip @ contexts inside wiki links [[...]]
	// First, extract all wiki link patterns
	const wikiLinkMatches: string[] = [];
	const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
	let wikiMatch;
	while ((wikiMatch = wikiLinkRegex.exec(remainingContent)) !== null) {
		wikiLinkMatches.push(wikiMatch[0]);
	}

	// Try @ prefix (primary or fallback)
	// Use .exec to find the first match only for @context
	const contextMatch = new RegExp(EMOJI_CONTEXT_REGEX.source, "").exec(
		remainingContent
	); // Non-global search for first

	if (contextMatch && contextMatch[1]) {
		// Check if this @context is inside a wiki link
		const matchPosition = contextMatch.index;
		const isInsideWikiLink = wikiLinkMatches.some((link) => {
			const linkStart = remainingContent.indexOf(link);
			const linkEnd = linkStart + link.length;
			return matchPosition >= linkStart && matchPosition < linkEnd;
		});

		// Only process if not inside a wiki link
		if (!isInsideWikiLink) {
			task.context = contextMatch[1].trim();
			// Remove the first matched context tag here to avoid it being parsed as a general tag
			remainingContent = remainingContent.replace(contextMatch[0], "");
		}
	}

	return remainingContent;
}

function extractTags(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";

	// If using Dataview, remove all potential DV fields first
	if (useDataview) {
		remainingContent = remainingContent.replace(
			ANY_DATAVIEW_FIELD_REGEX,
			""
		);
	}

	// Exclude links (both wiki and markdown) from tag processing
	const wikiLinkRegex = /\[\[(?!.+?:)([^\]\[]+)\|([^\]\[]+)\]\]/g;
	const markdownLinkRegex = /\[([^\[\]]*)\]\((.*?)\)/g; // Final attempt at correctly escaped regex for [text](link)
	const links: { text: string; start: number; end: number }[] = [];
	let linkMatch: RegExpExecArray | null; // Explicit type for linkMatch
	let processedContent = remainingContent;

	// Find all wiki links and their positions
	wikiLinkRegex.lastIndex = 0; // Reset regex state
	while ((linkMatch = wikiLinkRegex.exec(remainingContent)) !== null) {
		links.push({
			text: linkMatch[0],
			start: linkMatch.index,
			end: linkMatch.index + linkMatch[0].length,
		});
	}

	// Find all markdown links and their positions
	markdownLinkRegex.lastIndex = 0; // Reset regex state
	while ((linkMatch = markdownLinkRegex.exec(remainingContent)) !== null) {
		// Avoid adding if it overlaps with an existing wiki link (though unlikely)
		const overlaps = links.some(
			(l) =>
				Math.max(l.start, linkMatch!.index) < // Use non-null assertion
				Math.min(l.end, linkMatch!.index + linkMatch![0].length) // Use non-null assertion
		);
		if (!overlaps) {
			links.push({
				text: linkMatch![0], // Use non-null assertion
				start: linkMatch!.index, // Use non-null assertion
				end: linkMatch!.index + linkMatch![0].length, // Use non-null assertion
			});
		}
	}

	// Sort links by start position to process them correctly
	links.sort((a, b) => a.start - b.start);

	// Temporarily replace links with placeholders
	if (links.length > 0) {
		let offset = 0;
		for (const link of links) {
			const adjustedStart = link.start - offset;
			// Ensure adjustedStart is not negative (can happen with overlapping regex logic, though we try to avoid it)
			if (adjustedStart < 0) continue;
			const placeholder = "".padStart(link.text.length, " "); // Replace with spaces
			processedContent =
				processedContent.substring(0, adjustedStart) +
				placeholder +
				processedContent.substring(adjustedStart + link.text.length);
			// Offset doesn't change because placeholder length matches link text length
		}
	}

	// Find all #tags in the content with links replaced by placeholders
	const tagMatches = processedContent.match(EMOJI_TAG_REGEX) || [];
	task.tags = tagMatches.map((tag) => tag.trim());

	// If using 'tasks' (emoji) format, derive project from tags if not set
	// Also make sure project wasn't already set by DV format before falling back
	if (!useDataview && !task.project) {
		const projectTag = task.tags.find((tag) =>
			tag.startsWith(EMOJI_PROJECT_PREFIX)
		);
		if (projectTag) {
			task.project = projectTag.substring(EMOJI_PROJECT_PREFIX.length);
		}
	}

	// If using Dataview format, filter out any remaining #project/ tags from the tag list
	if (useDataview) {
		task.tags = task.tags.filter(
			(tag) => !tag.startsWith(EMOJI_PROJECT_PREFIX)
		);
	}

	// Remove found tags (including potentially #project/ tags if format is 'tasks') from the original remaining content
	let contentWithoutTagsOrContext = remainingContent;
	for (const tag of task.tags) {
		// Ensure the tag is not empty or just '#' before creating regex
		if (tag && tag !== "#") {
			// Use word boundaries (or start/end of string/space) to avoid partial matches within links if tags are not fully removed initially
			// Regex: (?:^|\s)TAG(?=\s|$)
			// Need to escape the tag content properly.
			const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			// Match tag optionally preceded by whitespace, followed by whitespace or end of line.
			// The negative lookbehind (?<!...) might be useful but JS support varies. Using simpler approach.
			// Simpler approach: Replace ` TAG` or `TAG ` or `TAG` (at end). This is tricky.
			// Let's try replacing ` TAG` and `TAG ` first, then handle start/end cases.
			// Even simpler: replace the tag if surrounded by whitespace or at start/end.
			// Use a regex that captures the tag with potential surrounding whitespace/boundaries
			const tagRegex = new RegExp(
				// `(^|\\s)` // Start of string or whitespace
				`\\s?` + // Optional preceding space (handles beginning of line implicitly sometimes)
					escapedTag +
					// `(?=\\s|$)` // Followed by whitespace or end of string
					`(?=\\s|$)`, // Lookahead for space or end of string
				"g"
			);
			// Replace the match (space + tag) with an empty string or just a space if needed?
			// Replacing with empty string might collapse words. Let's try replacing with space if preceded by space.
			// This is getting complex. Let's stick to removing the tag and potentially adjacent space carefully.
			contentWithoutTagsOrContext = contentWithoutTagsOrContext.replace(
				tagRegex,
				""
			);
		}
	}

	// Also remove any remaining @context tags, making sure not to remove them from within links
	let finalContent = "";
	let lastIndex = 0;
	processedContent = contentWithoutTagsOrContext; // Start with content that had tags removed

	// Sort links again just in case order matters for reconstruction
	links.sort((a, b) => a.start - b.start);

	if (links.length > 0) {
		// Process content segments between links
		for (const link of links) {
			const segment = processedContent.substring(lastIndex, link.start);
			// Remove @context from the segment
			finalContent += segment.replace(/@[\w-]+/g, "").trim();
			// Add the original link back
			finalContent += link.text;
			lastIndex = link.end;
		}
		// Process the remaining segment after the last link
		const lastSegment = processedContent.substring(lastIndex);
		finalContent += lastSegment.replace(/@[\w-]+/g, "").trim();
	} else {
		// No links, safe to remove @context directly from the whole content
		finalContent = processedContent.replace(/@[\w-]+/g, "").trim();
	}

	// Clean up extra spaces that might result from replacements
	finalContent = finalContent.replace(/\s{2,}/g, " ").trim();

	return finalContent;
}

/**
 * Parse a single task line using regex and metadata format preference
 */
export function parseTaskLine(
	filePath: string,
	line: string,
	lineNumber: number,
	format: MetadataFormat
): Task | null {
	const taskMatch = line.match(TASK_REGEX);

	if (!taskMatch) return null;

	const [fullMatch, , , , status, contentWithMetadata] = taskMatch;
	if (status === undefined || contentWithMetadata === undefined) return null;

	const completed = status.toLowerCase() === "x";
	const id = `${filePath}-L${lineNumber}`;

	const task: Task = {
		id,
		content: contentWithMetadata.trim(), // Will be set after extraction
		filePath,
		line: lineNumber,
		completed,
		status: status,
		originalMarkdown: line,
		tags: [],
		children: [],
		priority: undefined,
		startDate: undefined,
		dueDate: undefined,
		scheduledDate: undefined,
		completedDate: undefined,
		createdDate: undefined,
		recurrence: undefined,
		project: undefined,
		context: undefined,
	};

	// Extract metadata in order
	let remainingContent = contentWithMetadata;
	remainingContent = extractDates(task, remainingContent, format);
	remainingContent = extractRecurrence(task, remainingContent, format);
	remainingContent = extractPriority(task, remainingContent, format);
	remainingContent = extractProject(task, remainingContent, format); // Extract project before context/tags
	remainingContent = extractContext(task, remainingContent, format);
	remainingContent = extractTags(task, remainingContent, format); // Tags last

	task.content = remainingContent.replace(/\s{2,}/g, " ").trim();

	return task;
}
