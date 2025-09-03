/*
 *     Licensed under the Apache License, Version 2.0
 */

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MotifService } from 'pages/motif/motif.service';
import { MotifSearchUtilModule } from 'pages/motif/motif_search_util/motif-search-util.module';
import { MotifViewOptionsModule } from 'pages/motif/motif_view_options/motif-view-options.module';
import { StructurePageComponent } from 'pages/structure/structure.component';
import { StructurePageRouting } from 'pages/structure/structure.routing';
import { StructureService } from 'pages/structure/structure.service';
import { StructureCDR3ClustersModule } from 'pages/structure/structure_cdr3_clusters/structure-cdr3-clusters.module';
import { StructureEpitopesModule } from 'pages/structure/structure_epitopes/structure-epitopes.module';

/**
 * Module declaration for the structure browser.  This module wires
 * together the route, components and service.  It also overrides the
 * MotifService provider so that any component relying on that token (such
 * as the search util) will receive an instance of StructureService instead.
 */
@NgModule({
  imports: [
    CommonModule,
    StructurePageRouting,
    MotifSearchUtilModule,
    MotifViewOptionsModule,
    StructureEpitopesModule,
    StructureCDR3ClustersModule
  ],
  declarations: [ StructurePageComponent ],
  exports: [ StructurePageComponent ],
  providers: [
    StructureService,
    { provide: MotifService, useExisting: StructureService }
  ]
})
export class StructurePageModule {}
