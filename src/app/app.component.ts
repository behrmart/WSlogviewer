import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface EventView {
  uid: string;
  id: string;
  timestamp: string;
  level: string;
  levelTone: 'error' | 'warning' | 'info' | 'debug' | 'trace' | 'neutral';
  application: string;
  context: string;
  message: string;
  rawJson: string;
  lineTitle: string;
  searchable: string;
}

interface JsonPreviewTarget {
  rawValue: unknown;
  rawJsonCache?: string;
}

interface MetaEntry extends JsonPreviewTarget {
  key: string;
  value: string;
}

interface PrettyFact {
  label: string;
  value: string;
}

interface PrettyMetadataBlock extends JsonPreviewTarget {
  key: string;
  title: string;
  subtitle: string;
  facts: PrettyFact[];
  highlights: string[];
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Workspaces JSON Log Viewer';
  fileName = '';
  parseError = '';

  applicationName = '-';
  totalEvents = 0;
  metaEntries: MetaEntry[] = [];
  prettyMetaBlocks: PrettyMetadataBlock[] = [];

  searchText = '';
  selectedLevels: string[] = [];
  selectedApplications: string[] = [];
  selectedContexts: string[] = [];

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
    this.selectedLevels = [];
    this.selectedApplications = [];
    this.selectedContexts = [];
    this.applyFilters();
  }

  toggleFilterOption(
    filterType: 'level' | 'application' | 'context',
    option: string,
    event: Event
  ): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;

    if (filterType === 'level') {
      this.selectedLevels = this.toggleSelection(this.selectedLevels, option, checked);
    } else if (filterType === 'application') {
      this.selectedApplications = this.toggleSelection(this.selectedApplications, option, checked);
    } else {
      this.selectedContexts = this.toggleSelection(this.selectedContexts, option, checked);
    }

    this.applyFilters();
  }

  isFilterOptionSelected(
    filterType: 'level' | 'application' | 'context',
    option: string
  ): boolean {
    if (filterType === 'level') {
      return this.selectedLevels.includes(option);
    }
    if (filterType === 'application') {
      return this.selectedApplications.includes(option);
    }

    return this.selectedContexts.includes(option);
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

  getMetaRawJson(target: JsonPreviewTarget): string {
    if (target.rawJsonCache) {
      return target.rawJsonCache;
    }

    const maxChars = 120000;
    const rawJson = this.toJsonString(target.rawValue, 2);
    target.rawJsonCache =
      rawJson.length > maxChars
        ? `${rawJson.slice(0, maxChars)}\n... [truncated at ${maxChars} characters]`
        : rawJson;

    return target.rawJsonCache;
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

    this.prettyMetaBlocks = this.buildPrettyMetaBlocks(meta);
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
      const matchesLevel =
        this.selectedLevels.length === 0 || this.selectedLevels.includes(event.level);
      const matchesApplication =
        this.selectedApplications.length === 0 ||
        this.selectedApplications.includes(event.application);
      const matchesContext =
        this.selectedContexts.length === 0 || this.selectedContexts.includes(event.context);

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

  private getLevelTone(level: string): 'error' | 'warning' | 'info' | 'debug' | 'trace' | 'neutral' {
    const upper = level.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('CRITICAL') || upper.includes('FATAL')) {
      return 'error';
    }
    if (upper.includes('WARN')) {
      return 'warning';
    }
    if (upper.includes('DEBUG')) {
      return 'debug';
    }
    if (upper.includes('TRACE')) {
      return 'trace';
    }
    if (upper.includes('INFO') || upper.includes('LOG')) {
      return 'info';
    }

    return 'neutral';
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

  private buildPrettyMetaBlocks(meta: Record<string, unknown> | null): PrettyMetadataBlock[] {
    if (!meta) {
      return [];
    }

    const blocks: PrettyMetadataBlock[] = [];
    const browser = this.asRecord(meta['browser']);
    if (browser) {
      blocks.push(this.buildBrowserBlock(browser));
    }

    const agent = this.asRecord(meta['agent']);
    if (agent) {
      blocks.push(this.buildAgentBlock(agent));
    }

    const settings = this.asRecord(meta['settings']);
    if (settings) {
      blocks.push(this.buildSettingsBlock(settings));
    }

    const templates = this.toRecordArray(meta['templates']);
    if (templates.length > 0) {
      blocks.push(this.buildTemplatesBlock(templates));
    }

    const widgetBlock = this.buildWidgetsBlock(meta, templates);
    if (widgetBlock) {
      blocks.push(widgetBlock);
    }

    return blocks;
  }

  private buildBrowserBlock(browser: Record<string, unknown>): PrettyMetadataBlock {
    const os = this.asRecord(browser['os']);
    const browserName = this.firstInline([browser['name'], browser['description']]) || 'Unknown';
    const browserVersion = this.valueToInlineString(browser['version']) || 'n/a';

    return {
      key: 'browser',
      title: 'Browser',
      subtitle: `${browserName} ${browserVersion}`.trim(),
      facts: [
        { label: 'Name', value: this.valueToInlineString(browser['name']) || 'unknown' },
        { label: 'Version', value: browserVersion },
        { label: 'Layout Engine', value: this.valueToInlineString(browser['layout']) || 'n/a' },
        {
          label: 'OS',
          value: this.firstInline([
            os?.['family'],
            os?.['name'],
            browser['platform']
          ]) || 'unknown'
        },
        { label: 'OS Version', value: this.valueToInlineString(os?.['version']) || 'n/a' },
        { label: 'Architecture', value: this.valueToInlineString(os?.['architecture']) || 'n/a' }
      ],
      highlights: this.compactHighlights([
        this.valueToInlineString(browser['description']),
        this.valueToInlineString(browser['ua'])
      ]),
      rawValue: browser
    };
  }

  private buildAgentBlock(agent: Record<string, unknown>): PrettyMetadataBlock {
    const reasonCodes = this.toRecordArray(agent['reasonCodes']);
    const reasonNames = reasonCodes
      .map((reason) => this.firstInline([reason['friendlyName'], reason['code']]))
      .filter((value) => value);

    const name =
      this.firstInline([
        agent['displayName'],
        `${this.valueToInlineString(agent['firstName'])} ${this.valueToInlineString(agent['lastName'])}`.trim()
      ]) || 'Unknown Agent';

    return {
      key: 'agent',
      title: 'Agent',
      subtitle: name,
      facts: [
        { label: 'Handle', value: this.valueToInlineString(agent['handle']) || 'n/a' },
        { label: 'Role', value: this.valueToInlineString(agent['role']) || 'n/a' },
        { label: 'State', value: this.valueToInlineString(agent['state']) || 'n/a' },
        { label: 'Channel', value: this.valueToInlineString(agent['channel']) || 'n/a' },
        { label: 'Station', value: this.valueToInlineString(agent['stationId']) || 'n/a' },
        { label: 'Agent ID', value: this.valueToInlineString(agent['agentId']) || 'n/a' },
        { label: 'Provider', value: this.valueToInlineString(agent['providerId']) || 'n/a' },
        { label: 'Reason Codes', value: `${reasonCodes.length}` }
      ],
      highlights: this.compactHighlights(reasonNames.slice(0, 10)),
      rawValue: agent
    };
  }

  private buildSettingsBlock(settings: Record<string, unknown>): PrettyMetadataBlock {
    const selectedKeys = [
      'environmentType',
      'websocketsEnabled',
      'hotdesk',
      'isWebRTC',
      'displayCanvasOnAlerting',
      'workspacesLogsDownloadEnabled',
      'workspacesLogsDataPrivacyEnabled',
      'forceRefreshRate',
      'maxDeferTime',
      'customerManagementFQDN',
      'pomWidgetLocation'
    ];

    const facts = selectedKeys
      .map((key) => ({
        label: this.prettyLabel(key),
        value: this.prettyValue(settings[key])
      }))
      .filter((fact) => fact.value !== 'n/a');

    const deferIntervals = this.prettyValue(settings['deferTimeIntervals']);
    const settingsEntries = Object.keys(settings).length;

    return {
      key: 'settings',
      title: 'Settings',
      subtitle: `${settingsEntries} settings entries`,
      facts,
      highlights: this.compactHighlights([`Defer intervals: ${deferIntervals}`]),
      rawValue: settings
    };
  }

  private buildTemplatesBlock(templates: Record<string, unknown>[]): PrettyMetadataBlock {
    let coreCount = 0;
    let compressedCount = 0;
    let totalTabs = 0;
    let totalWidgetRefs = 0;

    const templateNames = templates
      .map((template) => this.firstInline([template['name'], template['id']]))
      .filter((value) => value);

    for (const template of templates) {
      if (template['core'] === true) {
        coreCount += 1;
      }
      if (template['useCompressedWorkspaces'] === true) {
        compressedCount += 1;
      }
      totalTabs += this.countTemplateTabs(template);
      totalWidgetRefs += this.countTemplateWidgetRefs(template);
    }

    return {
      key: 'templates',
      title: 'Templates',
      subtitle: `${templates.length} templates`,
      facts: [
        { label: 'Core Templates', value: `${coreCount}` },
        { label: 'Compressed Layouts', value: `${compressedCount}` },
        { label: 'Total Tabs', value: `${totalTabs}` },
        { label: 'Widget References', value: `${totalWidgetRefs}` }
      ],
      highlights: this.compactHighlights(templateNames.slice(0, 10)),
      rawValue: templates
    };
  }

  private buildWidgetsBlock(
    meta: Record<string, unknown>,
    templates: Record<string, unknown>[]
  ): PrettyMetadataBlock | null {
    const localStorage = this.asRecord(meta['localStorage']);
    const widgetsRaw = this.valueToInlineString(localStorage?.['_cc.widgets']);
    const widgetCatalog = this.parseWidgetCatalog(widgetsRaw);

    const templateWidgetNames = this.extractTemplateWidgetNames(templates);
    const catalogWidgetNames = widgetCatalog
      .map((widget) => this.firstInline([widget['name'], widget['metadataName']]))
      .filter((value) => value);
    const uniqueNames = Array.from(new Set([...catalogWidgetNames, ...templateWidgetNames]));

    if (widgetCatalog.length === 0 && uniqueNames.length === 0) {
      return null;
    }

    return {
      key: 'widgets',
      title: 'Widgets',
      subtitle: `${uniqueNames.length} unique widget names`,
      facts: [
        { label: 'Widget Catalog', value: `${widgetCatalog.length}` },
        { label: 'Template Widget Refs', value: `${templateWidgetNames.length}` },
        { label: 'Unique Names', value: `${uniqueNames.length}` }
      ],
      highlights: this.compactHighlights(uniqueNames.slice(0, 12)),
      rawValue: {
        widgetCatalog,
        templateWidgetNames
      }
    };
  }

  private toRecordArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const records: Record<string, unknown>[] = [];
    for (const item of value) {
      const record = this.asRecord(item);
      if (record) {
        records.push(record);
      }
    }

    return records;
  }

  private parseWidgetCatalog(rawWidgets: string): Array<Record<string, unknown>> {
    if (!rawWidgets) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawWidgets) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      const widgets: Array<Record<string, unknown>> = [];
      for (const entry of parsed) {
        const widget = this.asRecord(entry);
        const metadata = this.asRecord(widget?.['metadata']);
        const configuration = this.asRecord(widget?.['configuration']);

        if (!widget) {
          continue;
        }

        widgets.push({
          name: this.firstInline([metadata?.['name'], configuration?.['name'], widget['name']]),
          metadataName: this.valueToInlineString(metadata?.['name']),
          description: this.valueToInlineString(metadata?.['description']),
          library: this.valueToInlineString(metadata?.['libraryName']) || this.valueToInlineString(metadata?.['library']),
          enabled: configuration?.['enabled'] === true
        });
      }

      return widgets;
    } catch {
      return [];
    }
  }

  private extractTemplateWidgetNames(templates: Record<string, unknown>[]): string[] {
    const names: string[] = [];

    for (const template of templates) {
      const layout = this.asRecord(template['layout']);
      if (!layout) {
        continue;
      }

      for (const roleLayoutValue of Object.values(layout)) {
        const roleLayout = this.asRecord(roleLayoutValue);
        const tabs = this.asRecord(roleLayout?.['tabs']);
        if (!tabs) {
          continue;
        }

        for (const tabValue of Object.values(tabs)) {
          const tab = this.asRecord(tabValue);
          const widgets = tab?.['widgets'];
          if (!Array.isArray(widgets)) {
            continue;
          }

          for (const widget of widgets) {
            const text = this.valueToInlineString(widget);
            if (text) {
              names.push(text);
            }
          }
        }
      }
    }

    return names;
  }

  private countTemplateTabs(template: Record<string, unknown>): number {
    const layout = this.asRecord(template['layout']);
    if (!layout) {
      return 0;
    }

    let count = 0;
    for (const roleLayoutValue of Object.values(layout)) {
      const roleLayout = this.asRecord(roleLayoutValue);
      const tabs = this.asRecord(roleLayout?.['tabs']);
      if (tabs) {
        count += Object.keys(tabs).length;
      }
    }

    return count;
  }

  private countTemplateWidgetRefs(template: Record<string, unknown>): number {
    const layout = this.asRecord(template['layout']);
    if (!layout) {
      return 0;
    }

    let count = 0;
    for (const roleLayoutValue of Object.values(layout)) {
      const roleLayout = this.asRecord(roleLayoutValue);
      const tabs = this.asRecord(roleLayout?.['tabs']);
      if (!tabs) {
        continue;
      }

      for (const tabValue of Object.values(tabs)) {
        const tab = this.asRecord(tabValue);
        const widgets = tab?.['widgets'];
        if (Array.isArray(widgets)) {
          count += widgets.length;
        }
      }
    }

    return count;
  }

  private compactHighlights(values: string[]): string[] {
    const highlights: string[] = [];

    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const compact = trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
      highlights.push(compact);
    }

    return highlights;
  }

  private prettyLabel(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private prettyValue(value: unknown): string {
    const inlineValue = this.valueToInlineString(value);
    if (inlineValue) {
      return inlineValue;
    }

    if (Array.isArray(value)) {
      const items = value
        .map((item) => this.valueToInlineString(item))
        .filter((item) => item)
        .slice(0, 5);

      if (items.length === 0) {
        return `Array(${value.length})`;
      }

      return `${items.join(', ')}${value.length > items.length ? ', ...' : ''}`;
    }

    const asObject = this.asRecord(value);
    if (asObject) {
      return `Object(${Object.keys(asObject).length})`;
    }

    return 'n/a';
  }

  private extractMetaEntries(metaValue: Record<string, unknown> | null): MetaEntry[] {
    if (!metaValue) {
      return [];
    }

    const prettyMetaKeys = new Set(['browser', 'agent', 'settings', 'templates', 'widgets']);
    return Object.entries(metaValue)
      .filter(([key]) => !prettyMetaKeys.has(key))
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

  private toggleSelection(values: string[], option: string, checked: boolean): string[] {
    const hasOption = values.includes(option);

    if (checked && !hasOption) {
      return [...values, option];
    }
    if (!checked && hasOption) {
      return values.filter((value) => value !== option);
    }

    return values;
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
    this.prettyMetaBlocks = [];
    this.metaEntries = [];
    this.searchText = '';
    this.selectedLevels = [];
    this.selectedApplications = [];
    this.selectedContexts = [];
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
