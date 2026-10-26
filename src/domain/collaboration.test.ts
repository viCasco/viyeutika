import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECT, type GenerationRun, type ViyeuticaProject } from './project'
import { can, publishEstablishedSchedule, restorePublicationVersion } from './collaboration'

const run:GenerationRun={id:'r1',createdAt:'2026-10-26T00:00:00.000Z',status:'complete',score:10000,hardViolations:0,softPenalty:0,placedSessions:0,requestedSessions:0,entries:[],notes:[]}

describe('publication and collaboration model',()=>{
  it('keeps teacher permissions restricted in local role model',()=>{
    expect(can('teacher','publish')).toBe(false)
    expect(can('teacher','view_own')).toBe(true)
    expect(can('direction','publish')).toBe(true)
  })

  it('publishes a versioned clone of the established schedule and can restore it',()=>{
    const project:ViyeuticaProject={...structuredClone(EMPTY_PROJECT),establishedScheduleRun:structuredClone(run)}
    const published=publishEstablishedSchedule(project,'Versión inicial')
    expect(published.collaboration.publicationStatus).toBe('published')
    expect(published.collaboration.versions).toHaveLength(1)
    expect(published.collaboration.publishedRun?.id).toBe('r1')
    const restored=restorePublicationVersion({...published,collaboration:{...published.collaboration,publishedRun:null}},published.collaboration.versions[0].id)
    expect(restored.collaboration.publishedRun?.id).toBe('r1')
  })
})
