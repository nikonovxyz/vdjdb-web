/*
 *     Licensed under the Apache License, Version 2.0
 */

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
    IStructureCDR3SearchEntry,
    IStructureCDR3SearchResult,
    IStructureEpitopeViewOptions
} from 'pages/structure/structure';

/**
 * Renders clusters returned from a CDR3 search.  Users can adjust the
 * number of clusters shown and toggle the visibility of the CDR3 hitbox.
 */
@Component({
    selector:        'structure-cdr3-clusters',
    templateUrl:     './structure-cdr3-clusters.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StructureCDR3ClustersComponent {
    private isHitboxVisible: boolean = true;

    /**
     * Default number of search results to show.
     */
    public top: number = 5;

    /**
     * View options controlling normalisation of cluster data.
     */
    @Input('options')
    public options: IStructureEpitopeViewOptions;

    /**
     * Search result containing both raw and normalised cluster lists.
     */
    @Input('clusters')
    public clusters: IStructureCDR3SearchResult;

    /**
     * Select a slice of the clusters to display based on the top setting and
     * normalisation option.
     */
    public getClustersEntries(): IStructureCDR3SearchEntry[] {
        let entries: IStructureCDR3SearchEntry[] = [];
        if (this.options && this.options.isNormalized) {
            entries = this.clusters.clustersNorm;
        } else {
            entries = this.clusters.clusters;
        }
        return entries.slice(0, this.top);
    }

    /**
     * Return the hitbox string for a cluster entry if visible.
     */
    public getCDR3Hitbox(entry: IStructureCDR3SearchEntry): string {
        return this.isHitboxVisible ? entry.cdr3 : undefined;
    }

    /**
     * Generate helper content for patterns containing ambiguous X characters.
     */
    public getCDR3SubstringHelpContent(entry: IStructureCDR3SearchEntry): string {
        return entry.cdr3.indexOf('X') !== -1 ? `Pattern: ${entry.cdr3.replace(/X/g, 'x')}` : '';
    }

    /**
     * Toggle whether the hitbox string is displayed on clusters.
     */
    public toggleHitboxVisibility(): void {
        this.isHitboxVisible = !this.isHitboxVisible;
    }

    /**
     * Update the number of results shown.
     */
    public setTop(top: number): void {
        this.top = top;
    }
}
