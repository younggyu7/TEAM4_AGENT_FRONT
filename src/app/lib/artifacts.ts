import { apiUrl } from '../../api'

// 한 버전 폴더(output/<프로젝트>/v<N>)에서 받을 수 있는 산출물 파일. 최종 산출물 화면 목록과 zip 받기가 같이 쓴다.
export const ARTIFACT_FILES: { name: string; label: string }[] = [
  { name: 'functions.md', label: '기능 명세서' },
  { name: 'erd.md', label: 'ERD 문서' },
  { name: 'schema.sql', label: 'DDL (PostgreSQL)' },
  { name: 'requirements.md', label: '요구사항 목록' },
  { name: 'traceability.md', label: '추적표' },
  { name: 'traceability.csv', label: '추적표 (CSV)' },
  { name: 'review_report.md', label: '검토 보고서' },
  { name: 'db_validation.md', label: 'DB 검증 보고서' },
  { name: 'semantic_review.md', label: '의미 검토 (최종 확정)' },
  { name: 'design.json', label: '설계 데이터 (JSON)' },
]

// 개발 스펙: 'ERD 최종 확정'으로 만든 최종본에 생기는, 개발 AI가 읽고 개발할 문서 (backend app/agents/tools/dev_spec.py, 읽는 순서대로)
export const DEV_SPEC_FILES: { name: string; label: string; summary: string }[] = [
  { name: 'AGENTS.md', label: '개발 AI 작업 규칙', summary: '읽는 순서, 지킬 원칙, 작업 방식, ID 규칙' },
  { name: 'PRD.md', label: '제품 요구사항', summary: '사업 개요, 사용자, 개발 범위, 비기능 요구사항, 미확정 사항' },
  { name: 'ARCHITECTURE.md', label: '시스템 구성', summary: '기술 스택, 모듈, 외부 연계, 보안, 성능, 배포 제약' },
  { name: 'DATABASE.md', label: '데이터베이스', summary: '테이블·관계·업무 제약·보안 컬럼 (기준은 schema.sql)' },
  { name: 'API.md', label: 'API', summary: '기능별 API: 경로·권한·요청·응답·오류, 필드마다 DB 컬럼' },
  { name: 'openapi.yaml', label: 'OpenAPI 정의', summary: 'API.md와 같은 내용의 OpenAPI 3.1 (기계가 읽는 기준)' },
  { name: 'ACCEPTANCE_CRITERIA.md', label: '수용 기준', summary: '기능·비기능 수용 기준 (AC ID = 테스트 이름), 테스트 방침' },
  { name: 'TASKS.md', label: '작업 목록', summary: '작업 순서·선행 작업·만들 것·완료 기준(AC)·보류' },
  { name: 'DECISIONS.md', label: '결정 기록', summary: '확인 질문의 답·추천안, 공통 결정, 요구사항 결정, 사용자 의견' },
]

/** 최종 산출물 목록·zip: 설계 산출물 + 개발 스펙 (없는 파일은 화면에서 뺀다) */
export const ALL_ARTIFACT_FILES = [...ARTIFACT_FILES, ...DEV_SPEC_FILES.map(({ name, label }) => ({ name, label: `개발 스펙 · ${label}` }))]

export const fileUrl = (project: string, version: string, name: string) =>
  apiUrl(`/file?${new URLSearchParams({ project, version, name })}`)
