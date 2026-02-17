import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface EventView {
  uid: string;
  id: string;
  timestamp: string;
  level: string;
  application: string;
  context: string;
  message: string;
  raw: string;
  searchable: string;
}

interface MetaEntry {
  key: string;
  value: string;
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
    this.applicationName = this.valueToInlineString(rootRecord?.['application']) || 'unknown';
    this.metaEntries = this.extractMetaEntries(rootRecord?.['meta']);

    const events = this.extractEvents(parsed, rootRecord);
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
  }

  private toEventView(eventValue: unknown, index: number): EventView {
    const event = this.asRecord(eventValue) ?? {};
    const data = this.asRecord(event['data']);
    const metaData = this.asRecord(event['metaData']);

    const id = this.valueToInlineString(event['id']) || `${index + 1}`;
    const timestamp = this.valueToInlineString(event['timestamp']) || '-';
    const level = this.valueToInlineString(metaData?.['level']) || 'unknown';
    const application = this.valueToInlineString(event['applicationName']) || 'unknown';
    const context = this.valueToInlineString(event['context']) || 'none';
    const message = this.extractMessage(event, data);
    const compactRaw = this.toJsonString(event, 0);

    return {
      uid: `${index}-${id}`,
      id,
      timestamp,
      level,
      application,
      context,
      message,
      raw: this.toJsonString(event, 2),
      searchable: `${id} ${timestamp} ${level} ${application} ${context} ${message} ${compactRaw}`
        .toLowerCase()
        .trim()
    };
  }

  private extractMessage(
    event: Record<string, unknown>,
    data: Record<string, unknown> | null
  ): string {
    const candidates: unknown[] = [
      data?.['message'],
      data?.['type'],
      data?.['event'],
      event['message']
    ];

    for (const candidate of candidates) {
      const text = this.valueToInlineString(candidate);
      if (text) {
        return text;
      }
    }

    if (data && Object.keys(data).length > 0) {
      return `Data keys: ${Object.keys(data).join(', ')}`;
    }

    return 'No short message available';
  }

  private extractEvents(parsed: unknown, rootRecord: Record<string, unknown> | null): unknown[] {
    if (Array.isArray(parsed)) {
      return parsed;
    }

    const events = rootRecord?.['events'];
    return Array.isArray(events) ? events : [];
  }

  private extractMetaEntries(metaValue: unknown): MetaEntry[] {
    const meta = this.asRecord(metaValue);
    if (!meta) {
      return [];
    }

    return Object.entries(meta)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => ({
        key,
        value: this.valueToInlineString(value) || this.toJsonString(value, 0)
      }));
  }

  private uniqueOptions(values: string[]): string[] {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
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
    this.isLoaded = false;
  }
}
