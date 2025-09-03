/*
 *     Licensed under the Apache License, Version 2.0
 */

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IStructureEpitope, IStructureEpitopeViewOptions } from 'pages/structure/structure';
import { StructureService } from 'pages/structure/structure.service';
import { take } from 'rxjs/operators';

/**
 * Displays a list of epitope entries.  If no epitopes are loaded the
 * component shows an informational message instructing users to select
 * structure using the metadata tree.
 */
@Component({
    selector:        'structure-epitopes',
    templateUrl:     './structure-epitopes.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StructureEpitopesComponent {
    /**
     * Current view options controlling whether cluster data is normalised.
     */
    @Input('options')
    public options: IStructureEpitopeViewOptions;

    /**
     * List of loaded epitopes.  Each epitope may contain one or more clusters.
     */
    @Input('epitopes')
    public epitopes: IStructureEpitope[];

    constructor(private structureService: StructureService) {}

    /**
     * When the user discards an epitope, find the associated metadata tree
     * nodes and mark them as unselected.  Afterwards update the selected
     * list and remove the epitope from the view.
     */
    public onEpitopeDiscard(epitope: IStructureEpitope): void {
        this.structureService.findTreeLevelValue(epitope.hash).pipe(take(1)).subscribe((values) => {
            values.forEach((value) => {
                this.structureService.discardTreeLevelValue(value);
            });
            this.structureService.updateSelected();
            setImmediate(() => {
                this.structureService.updateEpitopes();
            });
        });
    }

    /**
     * Track epitopes by their hash value to improve rendering performance in ngFor.
     */
    public trackEpitopeBy(_: number, epitope: IStructureEpitope): string {
        return epitope.hash;
    }
}
