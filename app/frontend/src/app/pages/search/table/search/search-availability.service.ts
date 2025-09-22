import { Injectable } from '@angular/core';
import { Utils } from 'utils/utils';

interface ISearchAvailabilityResponse {
  structures: string[];
  motifs: string[];
}

@Injectable({ providedIn: 'root' })
export class SearchAvailabilityService {
  private static readonly availabilityEndpoint: string = '/api/search/availability';

  private loadPromise: Promise<void> | null = null;
  private readonly structureIds: Set<string> = new Set<string>();
  private readonly motifKeys: Set<string> = new Set<string>();

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = Utils.HTTP.get(SearchAvailabilityService.availabilityEndpoint).then((response) => {
        const payload = JSON.parse(response.response) as ISearchAvailabilityResponse;
        if (payload && Array.isArray(payload.structures)) {
          payload.structures.forEach((id) => {
            const normalized = this.normalizeStructureId(id);
            if (normalized) {
              this.structureIds.add(normalized);
            }
          });
        }
        if (payload && Array.isArray(payload.motifs)) {
          payload.motifs.forEach((key) => {
            const normalized = this.normalizeMotifKey(key);
            if (normalized) {
              this.motifKeys.add(normalized);
            }
          });
        }
      }).catch((error) => {
        this.structureIds.clear();
        this.motifKeys.clear();
        this.loadPromise = null;
        throw error;
      });
    }
    return this.loadPromise;
  }

  private normalizeStructureId(structureId: string): string {
    return structureId ? structureId.trim().toLowerCase() : '';
  }

  private normalizeMotifPart(part: string): string {
    return part ? part.trim().toLowerCase() : '';
  }

  private normalizeMotifKey(key: string): string {
    return key ? key.trim().toLowerCase() : '';
  }

  private buildMotifKey(species: string, tcrChain: string, mhcClass: string, gene: string, epitope: string): string | null {
    const parts = [ species, tcrChain, mhcClass, gene, epitope ].map((part) => this.normalizeMotifPart(part));
    if (parts.some((part) => part.length === 0)) {
      return null;
    }
    return parts.join('|');
  }

  public async hasStructure(structureId: string): Promise<boolean> {
    await this.ensureLoaded();
    const normalized = this.normalizeStructureId(structureId);
    return normalized.length > 0 && this.structureIds.has(normalized);
  }

  public async hasMotif(species: string, tcrChain: string, mhcClass: string, gene: string, epitope: string): Promise<boolean> {
    await this.ensureLoaded();
    const key = this.buildMotifKey(species, tcrChain, mhcClass, gene, epitope);
    return key !== null && this.motifKeys.has(key);
  }
}
