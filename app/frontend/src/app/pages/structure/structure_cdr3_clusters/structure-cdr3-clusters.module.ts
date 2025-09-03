/*
 *     Licensed under the Apache License, Version 2.0
 */

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { StructureEpitopeClusterModule } from 'pages/structure/structure_epitope_cluster/structure-epitope-cluster.module';
import { ModalsModule } from 'shared/modals/modals.module';
import { StructureCDR3ClustersComponent } from './structure-cdr3-clusters.component';

@NgModule({
    imports:      [ CommonModule, StructureEpitopeClusterModule, ModalsModule ],
    declarations: [ StructureCDR3ClustersComponent ],
    exports:      [ StructureCDR3ClustersComponent ]
})
export class StructureCDR3ClustersModule {}
