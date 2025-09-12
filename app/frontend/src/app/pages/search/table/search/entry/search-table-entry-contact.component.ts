/*
 *     Licensed under the Apache License, Version 2.0
 */

import {ChangeDetectionStrategy, Component, ComponentFactoryResolver, ViewContainerRef} from '@angular/core';
import {SearchTableRow} from 'pages/search/table/search/row/search-table-row';
import {TableColumn} from 'shared/table/column/table-column';
import {TableEntry} from 'shared/table/entry/table-entry';

/* @Component({
    selector:        'td[search-table-entry-contact]',
    template:        `
        <span *ngIf="link; else noLink">
      <a [attr.href]="link" target="_blank" rel="noopener">
        <i class="ui image outline icon" style="color: rgb(55, 126, 184)"></i>
      </a>
    </span>
        <ng-template #noLink>
            <i class="ui image outline icon" style="color: #aaa"></i>
        </ng-template>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
}) */

@Component({
    selector:        'td[search-table-entry-image]',
    template: `
        <a [attr.href]="structureLink" target="_blank" rel="noopener"
           [popup]="imageLink" display="image" position="left" width="300"
           footer="Click on the icon to open the full image" topShift="-70"
           shiftStrategy="per-item" #popupDirective>
            <i class="ui image outline icon" style="color: rgb(55,126,184)"></i>
        </a>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchTableEntryContactComponent extends TableEntry {
    public structureLink: string | undefined;
    public imageLink: string | undefined;

    public create(entry: string, _column: TableColumn, columns: TableColumn[], row: SearchTableRow,
                  _hostViewContainer: ViewContainerRef, _resolver: ComponentFactoryResolver): void {
        const structureLink = this.generateStructureLink(row, columns);
        const imageLink = this.buildImageFromContacts(entry);
        this.structureLink = structureLink ? structureLink : undefined;
        this.imageLink = imageLink ? imageLink : undefined;
    }

    private parseQuery(qs: string): { [k: string]: string } {
        const out: { [k: string]: string } = {};
        qs.replace(/^\?/, '').split('&').forEach((kv) => {
            const i = kv.indexOf('=');
            if (i > -1) {
                const k = decodeURIComponent(kv.substring(0, i));
                out[k] = decodeURIComponent(kv.substring(i + 1));
            }
        });
        return out;
    }

    private buildImageFromContacts(entry: string): string | undefined {
        if (!entry) { return undefined; }
        if (entry.indexOf('/database/structure/') === 0 && entry.endsWith('.png')) {
            return entry;
        }
        if (entry.indexOf('/structure?') === 0) {
            const params = this.parseQuery(entry.substring('/structure'.length));
            const sid = params.structureId;
            const subset = (params.subset || '').toLowerCase();
            const dir = subset.indexOf('cdr4') !== -1 ? 'cdr4' : 'cdr8';
            if (sid) {
                return `/database/structure/${dir}/${sid}.png`;
            }
        }
        return undefined;
    }

    private getCellValue(row: SearchTableRow, columns: TableColumn[], columnName: string): string | undefined {
        const columnIndex = columns.findIndex((c) => c.name === columnName);
        if (columnIndex === -1) {
            return undefined;
        }
        return row.getEntries()[columnIndex];
    }

    private generateStructureLink(row: SearchTableRow, columns: TableColumn[]): string | undefined {
        const species = this.getCellValue(row, columns, 'species');
        const tcrChain = this.getCellValue(row, columns, 'gene');
        const mhcClass = this.getCellValue(row, columns, 'mhc.class');
        const gene = this.getCellValue(row, columns, 'mhc.a').replace(/:.+/, '');
        const epitopeSeq = this.getCellValue(row, columns, 'antigen.epitope');
        const structureId = JSON.parse(this.getCellValue(row, columns, 'meta'))['structure.id'];

        if (!species || !tcrChain || !mhcClass || !gene || !epitopeSeq || !structureId) {
            return undefined;
        }

        const params = new URLSearchParams();
        params.set('species', species);
        params.set('tcr_chain', tcrChain);
        params.set('mhc_class', mhcClass);
        params.set('gene', gene.replace(/:.+/, ''));
        params.set('epitope_seq', epitopeSeq);
        return `/structure?${params.toString()}`;
    }
}
