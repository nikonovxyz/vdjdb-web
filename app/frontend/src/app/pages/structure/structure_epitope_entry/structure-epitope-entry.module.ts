/*
 *     Licensed under the Apache License, Version 2.0
 */

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { StructureEpitopeEntryComponent } from './structure-epitope-entry.component';
import { StructureEpitopeClusterModule } from 'pages/structure/structure_epitope_cluster/structure-epitope-cluster.module';

@NgModule({
    imports:      [ CommonModule, StructureEpitopeClusterModule ],
    declarations: [ StructureEpitopeEntryComponent ],
    exports:      [ StructureEpitopeEntryComponent ]
})
export class StructureEpitopeEntryModule {}
