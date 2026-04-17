import type {
  A_Const,
  ColumnRef,
  FuncCall,
  Node17,
  ParseResult17,
  ResTarget,
  SelectStmt,
  SortBy,
} from '@supabase/pg-parser/17/types'
import { deparseSelectStatement, deparseSqlAst } from '../parseSql.js'
import type { CacheTreeNode } from './types.js'

interface DecompositionResult {
  rootNodeId: string
  nodes: CacheTreeNode[]
  warnings: string[]
}

interface AggregationRewriteResult {
  rewrittenNode: Node17
  containsAggregate: boolean
  unsupportedReason: string | null
}

interface UnknownRewriteResult {
  rewrittenValue: unknown
  containsAggregate: boolean
  unsupportedReason: string | null
}

interface AggregateInputBinding {
  alias: string
  expression: Node17
}

interface AggregatePlanAttempt {
  decomposition: DecompositionResult | null
  warning: string | null
}

interface SourceRelationBinding {
  alias: string
  originalRelation: Node17
  cteName: string
  keyColumnName: string
  isNullable: boolean
}

interface ReferencedAliases {
  aliases: Set<string>
  hasUnqualifiedReference: boolean
}

interface JoinInputPlan {
  nodes: CacheTreeNode[]
  joinedKeysetName: string
  sourceBindings: SourceRelationBinding[]
}

const aggregateFunctionNames = new Set(['count', 'sum', 'avg', 'min', 'max'])
const setOperationNone = 'SETOP_NONE'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNodeWrapper = (value: unknown): value is Node17 => {
  if (!isRecord(value)) {
    return false
  }

  const keys = Object.keys(value)

  if (keys.length !== 1) {
    return false
  }

  const [key] = keys

  return key !== undefined && /^[A-Z]/u.test(key)
}

const getNodeKind = (node: Node17): string => Object.keys(node)[0] ?? ''

const createNodeWrapper = (kind: string, payload: unknown): Node17 =>
  ({ [kind]: payload } as unknown as Node17)

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    const clonedEntries: unknown[] = []

    for (const entry of value as unknown[]) {
      clonedEntries.push(cloneValue(entry))
    }

    return clonedEntries as T
  }

  if (!isRecord(value)) {
    return value
  }

  const cloned: Record<string, unknown> = {}

  for (const [key, nested] of Object.entries(value)) {
    cloned[key] = cloneValue(nested)
  }

  return cloned as T
}

const normalizeNodeForKey = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNodeForKey(entry))
  }

  if (!isRecord(value)) {
    return value
  }

  const normalized: Record<string, unknown> = {}

  for (const [key, nested] of Object.entries(value)) {
    if (key === 'location') {
      continue
    }

    normalized[key] = normalizeNodeForKey(nested)
  }

  return normalized
}

const nodeKey = (node: Node17): string => JSON.stringify(normalizeNodeForKey(node))

const createStringNode = (value: string): Node17 => ({
  String: {
    sval: value,
  },
})

const createColumnRefNode = (fieldNames: string[]): Node17 => ({
  ColumnRef: {
    fields: fieldNames.map((fieldName) => createStringNode(fieldName)),
  },
})

const createStarTargetNode = (): Node17 => ({
  ResTarget: {
    val: {
      ColumnRef: {
        fields: [
          {
            A_Star: {},
          },
        ],
      },
    },
  },
})

const createRangeVarNode = (relationName: string, aliasName?: string): Node17 => {
  const rangeVar: Record<string, unknown> = {
    catalogname: '',
    schemaname: '',
    relname: relationName,
    inh: true,
    relpersistence: 'p',
  }

  if (aliasName !== undefined) {
    rangeVar['alias'] = {
      aliasname: aliasName,
    }
  }

  return {
    RangeVar: rangeVar as never,
  } as Node17
}

const createResTargetNode = (value: Node17, name?: string): Node17 => {
  const target: ResTarget = {
    val: value,
  }

  if (name !== undefined) {
    target.name = name
  }

  return {
    ResTarget: target,
  }
}

const createOrdinalConstNode = (position: number): Node17 => ({
  A_Const: {
    ival: {
      ival: position,
    },
    isnull: false,
  },
})

const createOperatorExpressionNode = (
  operator: string,
  leftExpression: Node17,
  rightExpression: Node17,
): Node17 => ({
  A_Expr: {
    kind: 'AEXPR_OP',
    name: [createStringNode(operator)],
    lexpr: leftExpression,
    rexpr: rightExpression,
  },
})

const createInSubqueryPredicateNode = (
  testExpression: Node17,
  relationName: string,
  relationColumnName: string,
): Node17 => ({
  SubLink: {
    subLinkType: 'ANY_SUBLINK',
    subLinkId: 0,
    testexpr: testExpression,
    subselect: {
      SelectStmt: {
        targetList: [createResTargetNode(createColumnRefNode([relationColumnName]))],
        fromClause: [createRangeVarNode(relationName)],
        op: setOperationNone,
        all: false,
      },
    },
  },
})

const sanitizeCteSuffix = (input: string): string => {
  const sanitized = input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized.length === 0 ? 'source' : sanitized
}

interface SelectFromRelationOptions {
  sortClause?: Node17[]
  limitCount?: Node17
  limitOffset?: Node17
  limitOption?: SelectStmt['limitOption']
}

const createSelectFromRelation = (
  relationName: string,
  options: SelectFromRelationOptions = {},
): SelectStmt => {
  const selectFromRelation: SelectStmt = {
    targetList: [createStarTargetNode()],
    fromClause: [createRangeVarNode(relationName)],
    op: setOperationNone,
    all: false,
  }

  if (options.sortClause !== undefined) {
    selectFromRelation.sortClause = options.sortClause
  }

  if (options.limitCount !== undefined) {
    selectFromRelation.limitCount = options.limitCount
  }

  if (options.limitOffset !== undefined) {
    selectFromRelation.limitOffset = options.limitOffset
  }

  if (options.limitOption !== undefined) {
    selectFromRelation.limitOption = options.limitOption
  }

  return selectFromRelation
}

const readRootStatement = (parsedAst: ParseResult17): Node17 | null =>
  parsedAst.stmts?.[0]?.stmt ?? null

const readSelectStatement = (statementNode: Node17 | null): SelectStmt | null => {
  if (statementNode === null || !('SelectStmt' in statementNode)) {
    return null
  }

  return statementNode.SelectStmt
}

const readResTarget = (node: Node17 | undefined): ResTarget | null => {
  if (node === undefined || !('ResTarget' in node)) {
    return null
  }

  return node.ResTarget
}

const readSortBy = (node: Node17 | undefined): SortBy | null => {
  if (node === undefined || !('SortBy' in node)) {
    return null
  }

  return node.SortBy
}

const readFunctionName = (funcCall: FuncCall): string | null => {
  const functionParts = funcCall.funcname ?? []

  if (functionParts.length === 0) {
    return null
  }

  let resolvedName: string | null = null

  for (const functionPart of functionParts) {
    if (!('String' in functionPart)) {
      continue
    }

    resolvedName = functionPart.String.sval ?? null
  }

  return resolvedName === null ? null : resolvedName.toLowerCase()
}

const isAggregateFunctionCall = (funcCall: FuncCall): boolean => {
  const functionName = readFunctionName(funcCall)

  if (functionName === null || !aggregateFunctionNames.has(functionName)) {
    return false
  }

  return funcCall.over === undefined
}

const getConstantInteger = (constantNode: A_Const): number | null =>
  constantNode.ival?.ival ?? null

const containsQualifiedColumnReference = (value: unknown): boolean => {
  let foundQualifiedReference = false

  const visit = (nested: unknown): void => {
    if (foundQualifiedReference) {
      return
    }

    if (Array.isArray(nested)) {
      for (const entry of nested) {
        visit(entry)
      }

      return
    }

    if (!isRecord(nested)) {
      return
    }

    if (isNodeWrapper(nested)) {
      if ('ColumnRef' in nested) {
        const columnRef = nested.ColumnRef as ColumnRef | undefined
        const fields = columnRef?.fields ?? []

        if (fields.length > 1) {
          foundQualifiedReference = true
          return
        }
      }

      const kind = getNodeKind(nested)
      visit((nested as Record<string, unknown>)[kind])
      return
    }

    for (const child of Object.values(nested)) {
      visit(child)
    }
  }

  visit(value)

  return foundQualifiedReference
}

const splitConjunctivePredicates = (predicate: Node17 | undefined): Node17[] => {
  if (predicate === undefined) {
    return []
  }

  if ('BoolExpr' in predicate && predicate.BoolExpr.boolop === 'AND_EXPR') {
    const components: Node17[] = []
    const boolExprArguments = predicate.BoolExpr.args ?? []

    for (const argument of boolExprArguments) {
      components.push(...splitConjunctivePredicates(argument))
    }

    return components
  }

  return [predicate]
}

const joinConjunctivePredicates = (predicates: Node17[]): Node17 | undefined => {
  if (predicates.length === 0) {
    return undefined
  }

  if (predicates.length === 1) {
    return cloneValue(predicates[0])
  }

  return {
    BoolExpr: {
      boolop: 'AND_EXPR',
      args: predicates.map((predicate) => cloneValue(predicate)),
    },
  }
}

const collectReferencedAliases = (expression: Node17): ReferencedAliases => {
  const aliases = new Set<string>()
  let hasUnqualifiedReference = false

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry)
      }

      return
    }

    if (!isRecord(value)) {
      return
    }

    if (isNodeWrapper(value)) {
      if ('ColumnRef' in value) {
        const fields = value.ColumnRef.fields ?? []

        if (fields.length >= 2 && fields[0] !== undefined && 'String' in fields[0]) {
          const aliasName = fields[0].String.sval

          if (aliasName !== undefined && aliasName.length > 0) {
            aliases.add(aliasName)
          }

          return
        }

        if (fields.length === 1) {
          hasUnqualifiedReference = true
        }

        return
      }

      const kind = getNodeKind(value)
      visit((value as Record<string, unknown>)[kind])
      return
    }

    for (const nested of Object.values(value)) {
      visit(nested)
    }
  }

  visit(expression)

  return {
    aliases,
    hasUnqualifiedReference,
  }
}

class RecursiveDescentSelectTranspiler {
  private readonly ctePrefix: string
  private readonly parsedAst: ParseResult17
  private readonly rootSelectStatement: SelectStmt
  private warnings: string[] = []

  constructor(parsedAst: ParseResult17, rootSelectStatement: SelectStmt, ctePrefix: string) {
    this.parsedAst = parsedAst
    this.rootSelectStatement = rootSelectStatement
    this.ctePrefix = ctePrefix
  }

  async transpile(): Promise<DecompositionResult> {
    if (this.rootSelectStatement.withClause !== undefined) {
      return this.buildPassthroughDecomposition(
        'Detected a WITH query; kept it as a single cacheable stage.',
      )
    }

    if (this.rootSelectStatement.op !== undefined && this.rootSelectStatement.op !== setOperationNone) {
      return this.buildPassthroughDecomposition(
        'Detected set operators (UNION / INTERSECT / EXCEPT); kept the query in one stage.',
      )
    }

    const aggregatePlanAttempt = await this.tryBuildAggregationPlan()

    if (aggregatePlanAttempt.decomposition !== null) {
      return aggregatePlanAttempt.decomposition
    }

    if (aggregatePlanAttempt.warning !== null) {
      this.warnings.push(aggregatePlanAttempt.warning)
    }

    return this.buildSimplePlan()
  }

  private async buildPassthroughDecomposition(warning: string): Promise<DecompositionResult> {
    this.warnings.push(warning)
    const passthroughSql = await deparseSqlAst(this.parsedAst)
    const passthroughNode = this.createCacheNode('query', 'passthrough', passthroughSql, [])

    return {
      rootNodeId: passthroughNode.id,
      nodes: [passthroughNode],
      warnings: this.warnings,
    }
  }

  private createCacheNode(
    suffix: string,
    kind: CacheTreeNode['kind'],
    sql: string,
    dependsOn: string[],
  ): CacheTreeNode {
    const cteName = `${this.ctePrefix}_${suffix}`

    return {
      id: cteName,
      cteName,
      kind,
      sql,
      dependsOn,
      cacheable: true,
    }
  }

  private async emitSelectNode(
    suffix: string,
    kind: CacheTreeNode['kind'],
    selectStatement: SelectStmt,
    dependsOn: string[],
  ): Promise<CacheTreeNode> {
    const sql = await deparseSelectStatement(selectStatement)

    return this.createCacheNode(suffix, kind, sql, dependsOn)
  }

  private readRangeVarAlias(rangeVarNode: Node17): string | null {
    if (!('RangeVar' in rangeVarNode)) {
      return null
    }

    const rangeVar = rangeVarNode.RangeVar
    const explicitAlias = rangeVar.alias?.aliasname

    if (explicitAlias !== undefined && explicitAlias.length > 0) {
      return explicitAlias
    }

    const relationName = rangeVar.relname

    return relationName === undefined || relationName.length === 0 ? null : relationName
  }

  private collectSourceBindingsFromFromNode(
    fromNode: Node17,
    bindings: SourceRelationBinding[],
  ): boolean {
    if ('RangeVar' in fromNode) {
      const alias = this.readRangeVarAlias(fromNode)

      if (alias === null) {
        return false
      }

      bindings.push({
        alias,
        originalRelation: cloneValue(fromNode),
        cteName: '',
        keyColumnName: '',
        isNullable: false,
      })
      return true
    }

    if ('JoinExpr' in fromNode) {
      const leftRelation = fromNode.JoinExpr.larg
      const rightRelation = fromNode.JoinExpr.rarg

      if (leftRelation === undefined || rightRelation === undefined) {
        return false
      }

      const didCollectLeft = this.collectSourceBindingsFromFromNode(leftRelation, bindings)

      if (!didCollectLeft) {
        return false
      }

      const didCollectRight = this.collectSourceBindingsFromFromNode(rightRelation, bindings)

      if (!didCollectRight) {
        return false
      }

      return true
    }

    return false
  }

  private collectNullableAliasesFromFromNode(
    fromNode: Node17,
    parentNullable: boolean,
    nullableByAlias: Map<string, boolean>,
  ): boolean {
    if ('RangeVar' in fromNode) {
      const alias = this.readRangeVarAlias(fromNode)

      if (alias === null) {
        return false
      }

      const wasNullable = nullableByAlias.get(alias) ?? false
      nullableByAlias.set(alias, wasNullable || parentNullable)
      return true
    }

    if ('JoinExpr' in fromNode) {
      const join = fromNode.JoinExpr
      const joinType = join.jointype ?? 'JOIN_INNER'
      const leftRelation = join.larg
      const rightRelation = join.rarg

      if (leftRelation === undefined || rightRelation === undefined) {
        return false
      }

      let leftNullable = parentNullable
      let rightNullable = parentNullable

      if (joinType === 'JOIN_LEFT') {
        rightNullable = true
      } else if (joinType === 'JOIN_RIGHT') {
        leftNullable = true
      } else if (joinType === 'JOIN_FULL') {
        leftNullable = true
        rightNullable = true
      } else if (joinType !== 'JOIN_INNER') {
        return false
      }

      const didCollectLeft = this.collectNullableAliasesFromFromNode(
        leftRelation,
        leftNullable,
        nullableByAlias,
      )

      if (!didCollectLeft) {
        return false
      }

      return this.collectNullableAliasesFromFromNode(rightRelation, rightNullable, nullableByAlias)
    }

    return false
  }

  private collectSourceBindings(fromClause: Node17[] | undefined): SourceRelationBinding[] | null {
    const bindings: SourceRelationBinding[] = []

    for (const fromNode of fromClause ?? []) {
      const didCollect = this.collectSourceBindingsFromFromNode(fromNode, bindings)

      if (!didCollect) {
        return null
      }
    }

    const nullableByAlias = new Map<string, boolean>()

    for (const fromNode of fromClause ?? []) {
      const didCollectNullableAliases = this.collectNullableAliasesFromFromNode(
        fromNode,
        false,
        nullableByAlias,
      )

      if (!didCollectNullableAliases) {
        return null
      }
    }

    const usedKeyColumnNames = new Set<string>()

    for (const [index, binding] of bindings.entries()) {
      const suffix = sanitizeCteSuffix(binding.alias)
      let keyColumnName = `${suffix}_id`

      if (usedKeyColumnNames.has(keyColumnName)) {
        keyColumnName = `${suffix}_id_${index + 1}`
      }

      usedKeyColumnNames.add(keyColumnName)
      binding.keyColumnName = keyColumnName
      binding.isNullable = nullableByAlias.get(binding.alias) ?? false
    }

    return bindings
  }

  private withRangeVarAlias(rangeVarNode: Node17, alias: string): Node17 {
    if (!('RangeVar' in rangeVarNode)) {
      return cloneValue(rangeVarNode)
    }

    const rewrittenRangeVar = cloneValue(rangeVarNode.RangeVar)
    rewrittenRangeVar.alias ??= {
      aliasname: alias,
    }

    return {
      RangeVar: rewrittenRangeVar,
    }
  }

  private buildHydrationFromClause(
    joinedKeysetName: string,
    sourceBindings: SourceRelationBinding[],
  ): Node17[] {
    const joinedKeysAlias = 'joined_keys'
    let joinTree: Node17 = createRangeVarNode(joinedKeysetName, joinedKeysAlias)

    for (const sourceBinding of sourceBindings) {
      const tableRelation = this.withRangeVarAlias(sourceBinding.originalRelation, sourceBinding.alias)
      const joinCondition = createOperatorExpressionNode(
        '=',
        createColumnRefNode([sourceBinding.alias, 'id']),
        createColumnRefNode([joinedKeysAlias, sourceBinding.keyColumnName]),
      )

      joinTree = {
        JoinExpr: {
          jointype: sourceBinding.isNullable ? 'JOIN_LEFT' : 'JOIN_INNER',
          isNatural: false,
          larg: joinTree,
          rarg: tableRelation,
          quals: joinCondition,
          rtindex: 0,
        },
      }
    }

    return [joinTree]
  }

  private async buildJoinInputPlan(selectStatement: SelectStmt): Promise<JoinInputPlan | null> {
    const sourceBindings = this.collectSourceBindings(selectStatement.fromClause)

    if (sourceBindings === null || sourceBindings.length === 0 || selectStatement.fromClause === undefined) {
      return null
    }

    const bindingByAlias = new Map(sourceBindings.map((binding) => [binding.alias, binding]))
    const rootPredicates = splitConjunctivePredicates(selectStatement.whereClause)
    const predicatesByAlias = new Map<string, Node17[]>()
    const globalPredicates: Node17[] = []

    for (const predicate of rootPredicates) {
      const references = collectReferencedAliases(predicate)

      if (references.hasUnqualifiedReference || references.aliases.size !== 1) {
        globalPredicates.push(cloneValue(predicate))
        continue
      }

      const [alias] = [...references.aliases]

      if (alias === undefined) {
        globalPredicates.push(cloneValue(predicate))
        continue
      }

      const binding = bindingByAlias.get(alias)

      if (binding === undefined || binding.isNullable) {
        globalPredicates.push(cloneValue(predicate))
        continue
      }

      const scopedPredicates = predicatesByAlias.get(alias) ?? []
      scopedPredicates.push(cloneValue(predicate))
      predicatesByAlias.set(alias, scopedPredicates)
    }

    const sourceKeysetNodes: CacheTreeNode[] = []
    const keysetPredicates: Node17[] = []

    for (const binding of sourceBindings) {
      const scopedPredicates = predicatesByAlias.get(binding.alias) ?? []

      if (scopedPredicates.length === 0) {
        continue
      }

      const scopedSourceSelect: SelectStmt = {
        targetList: [
          createResTargetNode(createColumnRefNode([binding.alias, 'id']), 'row_id'),
        ],
        fromClause: [this.withRangeVarAlias(binding.originalRelation, binding.alias)],
        op: setOperationNone,
        all: false,
      }
      const scopedWhereClause = joinConjunctivePredicates(scopedPredicates)

      if (scopedWhereClause !== undefined) {
        scopedSourceSelect.whereClause = scopedWhereClause
      }

      const sourceNode = await this.emitSelectNode(
        `keyset_${sanitizeCteSuffix(binding.alias)}`,
        'keyset',
        scopedSourceSelect,
        [],
      )

      sourceKeysetNodes.push(sourceNode)
      binding.cteName = sourceNode.cteName
      keysetPredicates.push(
        createInSubqueryPredicateNode(
          createColumnRefNode([binding.alias, 'id']),
          sourceNode.cteName,
          'row_id',
        ),
      )
    }

    const joinedKeysetSelect: SelectStmt = {
      targetList: sourceBindings.map((binding) =>
        createResTargetNode(
          createColumnRefNode([binding.alias, 'id']),
          binding.keyColumnName,
        ),
      ),
      fromClause: cloneValue(selectStatement.fromClause),
      op: setOperationNone,
      all: false,
    }
    const joinedWhereClause = joinConjunctivePredicates([
      ...globalPredicates,
      ...keysetPredicates,
    ])

    if (joinedWhereClause !== undefined) {
      joinedKeysetSelect.whereClause = joinedWhereClause
    }

    const joinedKeysetNode = await this.emitSelectNode(
      'joined_keys',
      'joined',
      joinedKeysetSelect,
      sourceKeysetNodes.map((node) => node.id),
    )

    return {
      nodes: [...sourceKeysetNodes, joinedKeysetNode],
      joinedKeysetName: joinedKeysetNode.cteName,
      sourceBindings,
    }
  }

  private listSelectTargets(selectStatement: SelectStmt): ResTarget[] | null {
    const targetList = selectStatement.targetList ?? []
    const targets: ResTarget[] = []

    for (const node of targetList) {
      const target = readResTarget(node)

      if (target?.val === undefined) {
        return null
      }

      targets.push(target)
    }

    return targets
  }

  private resolveGroupExpressions(
    selectStatement: SelectStmt,
    targets: ResTarget[],
  ): { expressions: Node17[] | null; warning: string | null } {
    const groupClause = selectStatement.groupClause ?? []
    const resolvedExpressions: Node17[] = []

    for (const groupNode of groupClause) {
      if ('A_Const' in groupNode) {
        const ordinal = getConstantInteger(groupNode.A_Const)

        if (ordinal !== null) {
          const referencedTarget = targets[ordinal - 1]

          if (referencedTarget?.val === undefined) {
            return {
              expressions: null,
              warning:
                'Detected aggregate structure but GROUP BY references an invalid target index.',
            }
          }

          resolvedExpressions.push(cloneValue(referencedTarget.val))
          continue
        }
      }

      resolvedExpressions.push(cloneValue(groupNode))
    }

    return {
      expressions: resolvedExpressions,
      warning: null,
    }
  }

  private tryRewriteAggregateExpression(
    node: Node17,
    aggregateInputs: Map<string, AggregateInputBinding>,
  ): AggregationRewriteResult {
    const rewriteNode = (wrappedNode: Node17): AggregationRewriteResult => {
      if ('FuncCall' in wrappedNode) {
        const functionCall = cloneValue(wrappedNode.FuncCall)

        if (isAggregateFunctionCall(functionCall)) {
          if (
            functionCall.agg_filter !== undefined ||
            (functionCall.agg_order?.length ?? 0) > 0 ||
            functionCall.agg_within_group === true ||
            functionCall.over !== undefined
          ) {
            return {
              rewrittenNode: wrappedNode,
              containsAggregate: true,
              unsupportedReason:
                'Aggregate modifiers (FILTER / ORDER / WINDOW) are not rewritten yet.',
            }
          }

          if (functionCall.agg_star === true) {
            return {
              rewrittenNode: wrappedNode,
              containsAggregate: true,
              unsupportedReason: null,
            }
          }

          const aggregateArguments = functionCall.args ?? []

          if (aggregateArguments.length !== 1) {
            return {
              rewrittenNode: wrappedNode,
              containsAggregate: true,
              unsupportedReason: 'Aggregate calls with multiple arguments are not rewritten yet.',
            }
          }

          const [aggregateArgument] = aggregateArguments

          if (aggregateArgument === undefined) {
            return {
              rewrittenNode: wrappedNode,
              containsAggregate: true,
              unsupportedReason: 'Aggregate call argument is missing.',
            }
          }

          const argumentClone = cloneValue(aggregateArgument)
          const argumentKey = nodeKey(argumentClone)
          const existingBinding = aggregateInputs.get(argumentKey)
          const alias =
            existingBinding?.alias ?? `agg_input_${aggregateInputs.size + 1}`

          if (existingBinding === undefined) {
            aggregateInputs.set(argumentKey, {
              alias,
              expression: argumentClone,
            })
          }

          functionCall.args = [createColumnRefNode([alias])]

          return {
            rewrittenNode: {
              FuncCall: functionCall,
            },
            containsAggregate: true,
            unsupportedReason: null,
          }
        }
      }

      const rewrittenKind = getNodeKind(wrappedNode)
      const rewrittenPayload = rewriteUnknown(
        (wrappedNode as Record<string, unknown>)[rewrittenKind],
      )

      return {
        rewrittenNode: createNodeWrapper(rewrittenKind, rewrittenPayload.rewrittenValue),
        containsAggregate: rewrittenPayload.containsAggregate,
        unsupportedReason: rewrittenPayload.unsupportedReason,
      }
    }

    const rewriteUnknown = (value: unknown): UnknownRewriteResult => {
      if (Array.isArray(value)) {
        const rewrittenEntries: unknown[] = []
        let containsAggregate = false
        let unsupportedReason: string | null = null

        for (const entry of value) {
          const rewrittenEntry = rewriteUnknown(entry)
          rewrittenEntries.push(rewrittenEntry.rewrittenValue)
          containsAggregate = containsAggregate || rewrittenEntry.containsAggregate

          if (unsupportedReason === null && rewrittenEntry.unsupportedReason !== null) {
            unsupportedReason = rewrittenEntry.unsupportedReason
          }
        }

        return {
          rewrittenValue: rewrittenEntries,
          containsAggregate,
          unsupportedReason,
        }
      }

      if (!isRecord(value)) {
        return {
          rewrittenValue: value,
          containsAggregate: false,
          unsupportedReason: null,
        }
      }

      if (isNodeWrapper(value)) {
        const rewrittenNode = rewriteNode(value)

        return {
          rewrittenValue: rewrittenNode.rewrittenNode,
          containsAggregate: rewrittenNode.containsAggregate,
          unsupportedReason: rewrittenNode.unsupportedReason,
        }
      }

      const rewrittenObject: Record<string, unknown> = {}
      let containsAggregate = false
      let unsupportedReason: string | null = null

      for (const [key, nested] of Object.entries(value)) {
        const rewrittenNested = rewriteUnknown(nested)
        rewrittenObject[key] = rewrittenNested.rewrittenValue
        containsAggregate = containsAggregate || rewrittenNested.containsAggregate

        if (unsupportedReason === null && rewrittenNested.unsupportedReason !== null) {
          unsupportedReason = rewrittenNested.unsupportedReason
        }
      }

      return {
        rewrittenValue: rewrittenObject,
        containsAggregate,
        unsupportedReason,
      }
    }

    return rewriteNode(node)
  }

  private isPortableSortClause(sortClause: Node17[] | undefined): boolean {
    const sortNodes = sortClause ?? []

    for (const sortNode of sortNodes) {
      const sortBy = readSortBy(sortNode)
      const expressionNode = sortBy?.node

      if (expressionNode === undefined) {
        return false
      }

      if ('A_Const' in expressionNode) {
        const ordinal = getConstantInteger(expressionNode.A_Const)

        if (ordinal !== null) {
          continue
        }
      }

      if ('ColumnRef' in expressionNode) {
        const fields = expressionNode.ColumnRef.fields ?? []

        if (
          fields.length === 1 &&
          fields[0] !== undefined &&
          'String' in fields[0]
        ) {
          continue
        }
      }

      return false
    }

    return true
  }

  private async tryBuildAggregationPlan(): Promise<AggregatePlanAttempt> {
    const rootSelect = this.rootSelectStatement

    if (rootSelect.havingClause !== undefined) {
      return {
        decomposition: null,
        warning: 'HAVING clauses are not rewritten yet, so the query stayed in a simpler layout.',
      }
    }

    if ((rootSelect.windowClause?.length ?? 0) > 0) {
      return {
        decomposition: null,
        warning: 'Window clauses are not rewritten yet, so the query stayed in a simpler layout.',
      }
    }

    if (containsQualifiedColumnReference(rootSelect.sortClause)) {
      return {
        decomposition: null,
        warning:
          'ORDER BY with table-qualified identifiers is not rewritten in aggregate mode yet.',
      }
    }

    const targets = this.listSelectTargets(rootSelect)

    if (targets === null) {
      return {
        decomposition: null,
        warning: null,
      }
    }

    const groupResolution = this.resolveGroupExpressions(rootSelect, targets)

    if (groupResolution.expressions === null) {
      return {
        decomposition: null,
        warning: groupResolution.warning,
      }
    }

    const groupExpressions = groupResolution.expressions
    const dimensionBindings = new Map<string, { alias: string; expression: Node17 }>()

    for (const groupExpression of groupExpressions) {
      const key = nodeKey(groupExpression)

      if (dimensionBindings.has(key)) {
        continue
      }

      dimensionBindings.set(key, {
        alias: `dim_${dimensionBindings.size + 1}`,
        expression: cloneValue(groupExpression),
      })
    }

    const aggregateInputs = new Map<string, AggregateInputBinding>()
    const aggregatedTargets: Node17[] = []
    const groupedTargetPositions: number[] = []
    const referencedDimensionKeys = new Set<string>()
    let containsAnyAggregate = false

    for (const target of targets) {
      const targetExpression = target.val

      if (targetExpression === undefined) {
        return {
          decomposition: null,
          warning: 'Encountered a SELECT target without an expression.',
        }
      }

      const rewrittenExpression = this.tryRewriteAggregateExpression(
        cloneValue(targetExpression),
        aggregateInputs,
      )

      if (rewrittenExpression.unsupportedReason !== null) {
        return {
          decomposition: null,
          warning: `${rewrittenExpression.unsupportedReason} Query stayed in a simpler layout.`,
        }
      }

      if (rewrittenExpression.containsAggregate) {
        containsAnyAggregate = true
        aggregatedTargets.push(createResTargetNode(rewrittenExpression.rewrittenNode, target.name))
        continue
      }

      const dimensionKey = nodeKey(targetExpression)
      const dimensionBinding = dimensionBindings.get(dimensionKey)

      if (dimensionBinding === undefined) {
        return {
          decomposition: null,
          warning:
            'Found non-aggregate SELECT expressions that do not map to GROUP BY terms.',
        }
      }

      referencedDimensionKeys.add(dimensionKey)
      groupedTargetPositions.push(aggregatedTargets.length + 1)
      aggregatedTargets.push(
        createResTargetNode(createColumnRefNode([dimensionBinding.alias]), target.name),
      )
    }

    if (!containsAnyAggregate && groupExpressions.length === 0) {
      return {
        decomposition: null,
        warning: null,
      }
    }

    if (groupExpressions.length !== referencedDimensionKeys.size) {
      return {
        decomposition: null,
        warning:
          'GROUP BY expressions not present in SELECT are not rewritten yet, so the query stayed in a simpler layout.',
      }
    }

    const hydratedTargets: Node17[] = [
      ...[...dimensionBindings.values()].map((binding) =>
        createResTargetNode(binding.expression, binding.alias),
      ),
      ...[...aggregateInputs.values()].map((binding) =>
        createResTargetNode(binding.expression, binding.alias),
      ),
    ]

    if (hydratedTargets.length === 0) {
      hydratedTargets.push(createResTargetNode(createOrdinalConstNode(1), 'row_marker'))
    }

    if (rootSelect.fromClause === undefined) {
      return {
        decomposition: null,
        warning: null,
      }
    }

    const joinInputPlan = await this.buildJoinInputPlan(rootSelect)

    if (joinInputPlan === null) {
      return {
        decomposition: null,
        warning:
          'Aggregate decomposition currently supports table/join sources only, so the query stayed in a simpler layout.',
      }
    }

    const hydrateSelect: SelectStmt = {
      targetList: hydratedTargets,
      fromClause: this.buildHydrationFromClause(
        joinInputPlan.joinedKeysetName,
        joinInputPlan.sourceBindings,
      ),
      op: setOperationNone,
      all: false,
    }

    const inputDependencyIds = joinInputPlan.nodes.map((node) => node.id)
    const hydrateNode = await this.emitSelectNode(
      'hydrate_rows',
      'hydrate',
      hydrateSelect,
      inputDependencyIds,
    )

    const rollupSelect: SelectStmt = {
      targetList: aggregatedTargets,
      fromClause: [createRangeVarNode(hydrateNode.cteName)],
      groupClause: groupedTargetPositions.map((position) => createOrdinalConstNode(position)),
      op: setOperationNone,
      all: false,
    }

    const rollupNode = await this.emitSelectNode(
      'rollup_rows',
      'rollup',
      rollupSelect,
      [hydrateNode.id],
    )

    const nodes: CacheTreeNode[] = [...joinInputPlan.nodes, hydrateNode, rollupNode]
    let previousNode = rollupNode

    if ((rootSelect.sortClause?.length ?? 0) > 0) {
      if (!this.isPortableSortClause(rootSelect.sortClause)) {
        return {
          decomposition: null,
          warning:
            'Complex ORDER BY expressions are not rewritten in aggregate mode yet, so the query stayed in a simpler layout.',
        }
      }

      const sortClause = rootSelect.sortClause

      if (sortClause === undefined) {
        return {
          decomposition: null,
          warning: 'ORDER BY clause unexpectedly disappeared during aggregate decomposition.',
        }
      }

      const orderedSelect = createSelectFromRelation(previousNode.cteName, {
        sortClause: cloneValue(sortClause),
      })

      const orderedNode = await this.emitSelectNode(
        'ordered_rows',
        'ordered',
        orderedSelect,
        [previousNode.id],
      )

      nodes.push(orderedNode)
      previousNode = orderedNode
    }

    if (rootSelect.limitCount !== undefined || rootSelect.limitOffset !== undefined) {
      const limitedSelect = createSelectFromRelation(previousNode.cteName)

      if (rootSelect.limitCount !== undefined) {
        limitedSelect.limitCount = cloneValue(rootSelect.limitCount)
      }

      if (rootSelect.limitOffset !== undefined) {
        limitedSelect.limitOffset = cloneValue(rootSelect.limitOffset)
      }

      if (rootSelect.limitOption !== undefined) {
        limitedSelect.limitOption = cloneValue(rootSelect.limitOption)
      }

      const limitedNode = await this.emitSelectNode(
        'limited_rows',
        'limited',
        limitedSelect,
        [previousNode.id],
      )

      nodes.push(limitedNode)
      previousNode = limitedNode
    }

    return {
      decomposition: {
        rootNodeId: previousNode.id,
        nodes,
        warnings: this.warnings,
      },
      warning: null,
    }
  }

  private async buildSimplePlan(): Promise<DecompositionResult> {
    const rootSelect = cloneValue(this.rootSelectStatement)
    const nodes: CacheTreeNode[] = []
    let shouldSplitOrderBy = (rootSelect.sortClause?.length ?? 0) > 0

    if (shouldSplitOrderBy && containsQualifiedColumnReference(rootSelect.sortClause)) {
      shouldSplitOrderBy = false
      this.warnings.push(
        'Kept ORDER BY in core query because qualified identifiers are not safely rewritable.',
      )
    }

    delete rootSelect.limitCount
    delete rootSelect.limitOffset
    delete rootSelect.limitOption

    if (shouldSplitOrderBy) {
      delete rootSelect.sortClause
    }

    const coreNode = await this.emitSelectNode('core_rows', 'core', rootSelect, [])
    nodes.push(coreNode)

    let previousNode = coreNode

    if (shouldSplitOrderBy && (this.rootSelectStatement.sortClause?.length ?? 0) > 0) {
      const rootSortClause = this.rootSelectStatement.sortClause

      if (rootSortClause === undefined) {
        this.warnings.push('ORDER BY clause unexpectedly disappeared during simple decomposition.')

        return {
          rootNodeId: previousNode.id,
          nodes,
          warnings: this.warnings,
        }
      }

      const orderedSelect = createSelectFromRelation(previousNode.cteName, {
        sortClause: cloneValue(rootSortClause),
      })

      const orderedNode = await this.emitSelectNode(
        'ordered_rows',
        'ordered',
        orderedSelect,
        [previousNode.id],
      )

      nodes.push(orderedNode)
      previousNode = orderedNode
    }

    if (
      this.rootSelectStatement.limitCount !== undefined ||
      this.rootSelectStatement.limitOffset !== undefined
    ) {
      const limitedSelect = createSelectFromRelation(previousNode.cteName)

      if (this.rootSelectStatement.limitCount !== undefined) {
        limitedSelect.limitCount = cloneValue(this.rootSelectStatement.limitCount)
      }

      if (this.rootSelectStatement.limitOffset !== undefined) {
        limitedSelect.limitOffset = cloneValue(this.rootSelectStatement.limitOffset)
      }

      if (this.rootSelectStatement.limitOption !== undefined) {
        limitedSelect.limitOption = cloneValue(this.rootSelectStatement.limitOption)
      }

      const limitedNode = await this.emitSelectNode(
        'limited_rows',
        'limited',
        limitedSelect,
        [previousNode.id],
      )

      nodes.push(limitedNode)
      previousNode = limitedNode
    }

    return {
      rootNodeId: previousNode.id,
      nodes,
      warnings: this.warnings,
    }
  }
}

export const decomposeSqlToCacheTree = async (
  parsedAst: ParseResult17,
  ctePrefix: string,
): Promise<DecompositionResult> => {
  const statement = readRootStatement(parsedAst)
  const statementKind = statement === null ? null : getNodeKind(statement)

  if (statementKind === null || statementKind !== 'SelectStmt') {
    const passthroughSql = await deparseSqlAst(parsedAst)
    const passthroughNode: CacheTreeNode = {
      id: `${ctePrefix}_query`,
      cteName: `${ctePrefix}_query`,
      kind: 'passthrough',
      sql: passthroughSql,
      dependsOn: [],
      cacheable: true,
    }

    return {
      rootNodeId: passthroughNode.id,
      nodes: [passthroughNode],
      warnings: [
        statementKind === null
          ? 'Input query did not contain a decomposable root statement.'
          : `Statement kind "${statementKind}" is not decomposed yet; query kept as passthrough.`,
      ],
    }
  }

  const rootSelectStatement = readSelectStatement(statement)

  if (rootSelectStatement === null) {
    const passthroughSql = await deparseSqlAst(parsedAst)
    const passthroughNode: CacheTreeNode = {
      id: `${ctePrefix}_query`,
      cteName: `${ctePrefix}_query`,
      kind: 'passthrough',
      sql: passthroughSql,
      dependsOn: [],
      cacheable: true,
    }

    return {
      rootNodeId: passthroughNode.id,
      nodes: [passthroughNode],
      warnings: ['Could not read SelectStmt payload from root statement; query kept as passthrough.'],
    }
  }

  const transpiler = new RecursiveDescentSelectTranspiler(
    parsedAst,
    rootSelectStatement,
    ctePrefix,
  )

  return transpiler.transpile()
}
