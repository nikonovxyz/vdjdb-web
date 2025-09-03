import { ChangeDetectionStrategy, Component, ComponentFactoryResolver, ViewContainerRef } from '@angular/core';
import { TableColumn } from 'shared/table/column/table-column';
import { TableEntry } from 'shared/table/entry/table-entry';
import { Utils } from 'utils/utils';
import { SearchTableRow } from '../row/search-table-row';
import ColorizedPatternRegion = Utils.SequencePattern.ColorizedPatternRegion;

@Component({
  selector:        'td[search-table-entry-cdr]',
  template:        `<a [href]="link" class="motif-link"><span *ngFor="let region of regions" [style.color]="region.color">{{ region.part }}</span></a>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchTableEntryCdrComponent extends TableEntry {
  public link: string = '#';
  public regions: ColorizedPatternRegion[] = [];

  public create(entry: string, _column: TableColumn, columns: TableColumn[], row: SearchTableRow,
                _hostViewContainer: ViewContainerRef, _resolver: ComponentFactoryResolver): void {
    this.regions = Utils.SequencePattern.colorizePattern(entry, row.metadata.cdr3vEnd, row.metadata.cdr3jStart);

    this.link = this.generateMotifLink(row, columns);
  }

  private getCellValue(row: SearchTableRow, columns: TableColumn[], columnName: string): string | undefined {
    const columnIndex = columns.findIndex((c) => c.name === columnName);
    if (columnIndex === -1) {
      return undefined;
    }
    return row.getEntries()[columnIndex];
  }

  private generateMotifLink(row: SearchTableRow, columns: TableColumn[]): string {
    const species = this.getCellValue(row, columns, 'species');
    const tcrChain = this.getCellValue(row, columns, 'gene');
    const mhcClass = this.getCellValue(row, columns, 'mhc.class');
    const gene = this.getCellValue(row, columns, 'mhc.a').replace(/:.+/, '');
    const epitopeSeq = this.getCellValue(row, columns, 'antigen.epitope');

    if (!species || !tcrChain || !mhcClass || !gene || !epitopeSeq) {
      return '#';
    }

    const params = new URLSearchParams();
    params.set('species', species);
    params.set('tcr_chain', tcrChain);
    params.set('mhc_class', mhcClass);
    params.set('gene', gene);
    params.set('epitope_seq', epitopeSeq);
    return `/motif?${params.toString()}`;
  }
}
