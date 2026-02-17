import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface EventView {
  uid: string;
  id: string;
  timestamp: string;
  level: string;
  levelTone: 'error' | 'warning' | 'normal';
  application: string;
  context: string;
  message: string;
  rawJson: string;
  lineTitle: string;
  searchable: string;
}

interface MetaEntry {
  key: string;
  value: string;
  rawValue: unknown;
  rawJsonCache?: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Workspace JSON Log Viewer';
  fileName = '';
  parseError = '';

  applicationName = '-';
  totalEvents = 0;
  metaEntries: MetaEntry[] = [];

  searchText = '';
  levelFilter = 'all';
  applicationFilter = 'all';
  contextFilter = 'all';

  levelOptions: string[] = [];
  applicationOptions: string[] = [];
  contextOptions: string[] = [];

  isLoaded = false;
  expandedEventUid: string | null = null;
  expandedMetaKey: string | null = null;
  filteredEvents: EventView[] = [];
  private eventViews: EventView[] = [];

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];

    if (!selectedFile) {
      return;
    }

    this.loadFile(selectedFile);
    input.value = '';
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchText = '';
    this.levelFilter = 'all';
    this.applicationFilter = 'all';
    this.contextFilter = 'all';
    this.applyFilters();
  }

  toggleEventJson(eventUid: string): void {
    this.expandedEventUid = this.expandedEventUid === eventUid ? null : eventUid;
  }

  isEventExpanded(eventUid: string): boolean {
    return this.expandedEventUid === eventUid;
  }

  toggleMetaJson(metaKey: string): void {
    this.expandedMetaKey = this.expandedMetaKey === metaKey ? null : metaKey;
  }

  isMetaExpanded(metaKey: string): boolean {
    return this.expandedMetaKey === metaKey;
  }

  getMetaRawJson(entry: MetaEntry): string {
    if (entry.rawJsonCache) {
      return entry.rawJsonCache;
    }

    const maxChars = 120000;
    const rawJson = this.toJsonString(entry.rawValue, 2);
    entry.rawJsonCache =
      rawJson.length > maxChars
        ? `${rawJson.slice(0, maxChars)}\n... [truncated at ${maxChars} characters]`
        : rawJson;

    return entry.rawJsonCache;
  }

  private loadFile(file: File): void {
    const reader = new FileReader();
    this.parseError = '';

    reader.onload = () => {
      try {
        const rawText = typeof reader.result === 'string' ? reader.result : '';
        if (!rawText.trim()) {
          throw new Error('The selected file is empty.');
        }

        const parsed = JSON.parse(rawText) as unknown;
        this.processJson(parsed, file.name);
      } catch (error) {
        this.handleParseError(error);
      }
    };

    reader.onerror = () => {
      this.handleParseError(new Error('Could not read the selected file.'));
    };

    reader.readAsText(file);
  }

  private processJson(parsed: unknown, fileName: string): void {
    this.resetViewerState();

    this.fileName = fileName;
    const rootRecord = this.asRecord(parsed);
    const events = this.extractEvents(parsed, rootRecord);
    const meta = this.extractMetaRecord(rootRecord);

    this.applicationName =
      this.firstInline([
        rootRecord?.['application'],
        rootRecord?.['applicationName'],
        meta?.['application'],
        meta?.['environmentType']
      ]) || this.inferApplicationFromEvents(events) || 'unknown';

    this.metaEntries = this.extractMetaEntries(meta);
    this.eventViews = events.map((event, index) => this.toEventView(event, index));
    this.totalEvents = this.eventViews.length;

    this.levelOptions = this.uniqueOptions(this.eventViews.map((event) => event.level));
    this.applicationOptions = this.uniqueOptions(
      this.eventViews.map((event) => event.application)
    );
    this.contextOptions = this.uniqueOptions(this.eventViews.map((event) => event.context));

    this.isLoaded = true;
    this.applyFilters();
  }

  private applyFilters(): void {
    const searchTerm = this.searchText.trim().toLowerCase();

    this.filteredEvents = this.eventViews.filter((event) => {
      const matchesSearch = !searchTerm || event.searchable.includes(searchTerm);
      const matchesLevel = this.levelFilter === 'all' || event.level === this.levelFilter;
      const matchesApplication =
        this.applicationFilter === 'all' || event.application === this.applicationFilter;
      const matchesContext = this.contextFilter === 'all' || event.context === this.contextFilter;

      return matchesSearch && matchesLevel && matchesApplication && matchesContext;
    });

    if (!this.filteredEvents.some((event) => event.uid === this.expandedEventUid)) {
      this.expandedEventUid = null;
    }
  }

  private toEventView(eventValue: unknown, index: number): EventView {
    const event = this.asRecord(eventValue) ?? {};
    const data = this.asRecord(event['data']);
    const metaData = this.asRecord(event['metaData']);

    const id =
      this.firstInline([event['id'], event['eventId'], event['uuid'], data?.['id']]) ||
      `${index + 1}`;
    const timestamp = this.normalizeTimestamp(
      this.firstDefined([
        event['timestamp'],
        event['time'],
        event['created'],
        event['dateTime'],
        data?.['timestamp'],
        data?.['time']
      ])
    );

    const level = this.inferLevel(event, data, metaData);
    const application =
      this.firstInline([
        event['applicationName'],
        event['application'],
        event['channel'],
        event['source'],
        data?.['source'],
        data?.['application'],
        data?.['provider']
      ]) || 'unknown';

    const context =
      this.firstInline([
        event['context'],
        event['topic'],
        event['eventType'],
        data?.['type'],
        data?.['eventName'],
        data?.['topic'],
        data?.['event']
      ]) || 'none';

    const message = this.extractMessage(event, data);
    const compactRaw = this.toJsonString(event, 0);
    const rawJson = this.toJsonString(event, 2);
    const searchableRaw = compactRaw.length > 1800 ? compactRaw.slice(0, 1800) : compactRaw;
    const lineTitle = `${timestamp} | ${level} | ${application} | ${context} | ${message}`;

    return {
      uid: `${index}-${id}`,
      id,
      timestamp,
      level,
      levelTone: this.getLevelTone(level),
      application,
      context,
      message,
      rawJson,
      lineTitle,
      searchable: `${id} ${lineTitle} ${searchableRaw}`.toLowerCase().trim()
    };
  }

  private getLevelTone(level: string): 'error' | 'warning' | 'normal' {
    const upper = level.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('CRITICAL') || upper.includes('FATAL')) {
      return 'error';
    }
    if (upper.includes('WARN')) {
      return 'warning';
    }
    return 'normal';
  }

  private inferLevel(
    event: Record<string, unknown>,
    data: Record<string, unknown> | null,
    metaData: Record<string, unknown> | null
  ): string {
    const candidates: unknown[] = [
      metaData?.['level'],
      event['level'],
      event['severity'],
      data?.['level'],
      data?.['severity'],
      data?.['notificationType'],
      event['channel']
    ];

    for (const candidate of candidates) {
      const text = this.valueToInlineString(candidate);
      if (!text) {
        continue;
      }

      const normalized = this.normalizeLevel(text);
      if (normalized) {
        return normalized;
      }
    }

    return 'UNKNOWN';
  }

  private normalizeLevel(value: string): string {
    const upper = value.toUpperCase();

    if (upper.includes('CRITICAL') || upper.includes('FATAL')) {
      return 'CRITICAL';
    }
    if (upper.includes('ERROR') || upper === 'ERR') {
      return 'ERROR';
    }
    if (upper.includes('WARN')) {
      return 'WARNING';
    }
    if (upper.includes('DEBUG')) {
      return 'DEBUG';
    }
    if (upper.includes('TRACE')) {
      return 'TRACE';
    }
    if (upper.includes('INFO') || upper === 'LOG') {
      return 'INFO';
    }

    if (/^[A-Z0-9_-]{2,20}$/.test(upper)) {
      return upper;
    }

    return '';
  }

  private extractMessage(
    event: Record<string, unknown>,
    data: Record<string, unknown> | null
  ): string {
    const candidates: unknown[] = [
      data?.['message'],
      event['message'],
      data?.['detail'],
      data?.['reason'],
      data?.['type'],
      data?.['eventName'],
      data?.['event'],
      event['topic'],
      event['type'],
      data?.['code'],
      event['code']
    ];

    for (const candidate of candidates) {
      const text = this.valueToInlineString(candidate);
      if (text) {
        return text;
      }
    }

    if (data && Object.keys(data).length > 0) {
      return `Data keys: ${Object.keys(data).slice(0, 6).join(', ')}`;
    }

    return 'No short message available';
  }

  private extractEvents(parsed: unknown, rootRecord: Record<string, unknown> | null): unknown[] {
    if (Array.isArray(parsed)) {
      return parsed;
    }

    const dataRecord = this.asRecord(rootRecord?.['data']);
    const payloadRecord = this.asRecord(rootRecord?.['payload']);

    const directCandidates: unknown[] = [
      rootRecord?.['events'],
      rootRecord?.['logs'],
      rootRecord?.['records'],
      rootRecord?.['entries'],
      rootRecord?.['items'],
      dataRecord?.['events'],
      dataRecord?.['logs'],
      payloadRecord?.['events'],
      payloadRecord?.['logs']
    ];

    for (const candidate of directCandidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    if (rootRecord) {
      for (const value of Object.values(rootRecord)) {
        if (Array.isArray(value) && this.looksLikeEventArray(value)) {
          return value;
        }
      }
    }

    return [];
  }

  private looksLikeEventArray(values: unknown[]): boolean {
    const sampleSize = Math.min(values.length, 20);
    let matches = 0;

    for (let i = 0; i < sampleSize; i += 1) {
      const entry = this.asRecord(values[i]);
      if (!entry) {
        continue;
      }

      if (
        entry['timestamp'] !== undefined ||
        entry['topic'] !== undefined ||
        entry['message'] !== undefined ||
        entry['event'] !== undefined ||
        entry['data'] !== undefined
      ) {
        matches += 1;
      }
    }

    return matches >= 1;
  }

  private extractMetaRecord(rootRecord: Record<string, unknown> | null): Record<string, unknown> | null {
    return (
      this.asRecord(rootRecord?.['meta']) ||
      this.asRecord(rootRecord?.['metadata']) ||
      this.asRecord(rootRecord?.['header']) ||
      null
    );
  }

  private extractMetaEntries(metaValue: Record<string, unknown> | null): MetaEntry[] {
    if (!metaValue) {
      return [];
    }

    return Object.entries(metaValue)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => ({
        key,
        value: this.summarizeMetaValue(value),
        rawValue: value
      }));
  }

  private summarizeMetaValue(value: unknown): string {
    const inlineValue = this.valueToInlineString(value);

    if (inlineValue) {
      return inlineValue.length > 180 ? `${inlineValue.slice(0, 177)}...` : inlineValue;
    }

    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }

    const asObject = this.asRecord(value);
    if (asObject) {
      const keys = Object.keys(asObject);
      const preview = keys.slice(0, 5).join(', ');
      const suffix = keys.length > 5 ? ', ...' : '';
      return `Object(${keys.length} keys): ${preview}${suffix}`;
    }

    return this.toJsonString(value, 0);
  }

  private inferApplicationFromEvents(events: unknown[]): string {
    const sampleSize = Math.min(events.length, 100);

    for (let i = 0; i < sampleSize; i += 1) {
      const event = this.asRecord(events[i]);
      const data = this.asRecord(event?.['data']);
      const application = this.firstInline([
        event?.['applicationName'],
        event?.['application'],
        event?.['channel'],
        event?.['source'],
        data?.['source']
      ]);

      if (application) {
        return application;
      }
    }

    return '';
  }

  private uniqueOptions(values: string[]): string[] {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
  }

  private firstInline(values: Array<unknown>): string {
    for (const value of values) {
      const text = this.valueToInlineString(value);
      if (text) {
        return text;
      }
    }

    return '';
  }

  private firstDefined(values: Array<unknown>): unknown {
    for (const value of values) {
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  private normalizeTimestamp(value: unknown): string {
    const asText = this.valueToInlineString(value);
    if (asText) {
      return asText;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '-';
    }

    const raw = Math.trunc(value);
    const milliseconds = raw > 99999999999 ? raw : raw * 1000;
    const asDate = new Date(milliseconds);

    if (!Number.isNaN(asDate.valueOf())) {
      return asDate.toISOString();
    }

    return String(value);
  }

  private valueToInlineString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return '';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private toJsonString(value: unknown, indentation: number): string {
    try {
      return JSON.stringify(value, null, indentation) ?? String(value);
    } catch {
      return String(value);
    }
  }

  private handleParseError(error: unknown): void {
    this.resetViewerState();
    this.parseError =
      error instanceof Error
        ? `Invalid JSON file: ${error.message}`
        : 'Invalid JSON file: unknown error';
  }

  private resetViewerState(): void {
    this.fileName = '';
    this.applicationName = '-';
    this.totalEvents = 0;
    this.metaEntries = [];
    this.searchText = '';
    this.levelFilter = 'all';
    this.applicationFilter = 'all';
    this.contextFilter = 'all';
    this.levelOptions = [];
    this.applicationOptions = [];
    this.contextOptions = [];
    this.eventViews = [];
    this.filteredEvents = [];
    this.expandedEventUid = null;
    this.expandedMetaKey = null;
    this.isLoaded = false;
  }
}
