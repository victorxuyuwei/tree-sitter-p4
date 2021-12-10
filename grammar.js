// %left ','
// %nonassoc '?'
// %nonassoc ':'
// %left '||'
// %left '&&'
// %left '==' '!='
// %left '<' '>' '<=' '>='
// %left '|'
// %left '^'
// %left '&'
// %left '<<' '>>'
// %left '++' '+' '-' '|+|' '|-|'
// %left '*' '/' '%'
// %right PREFIX
// %nonassoc ']' '(' '['
// %left '.'

const PREC = {
  COMMA: 1,
  QUESTION: 2,
  COLON: 3,
  LOR: 4,
  LAND: 5,
  EQ: 6,
  CMP: 7,
  OR: 8,
  XOR: 9,
  AND: 10,
  SHIFT: 11,
  ADD: 12,
  MULTI: 13,
  UNARY: 14, // a.k.a PREFIX in spec
  BRACKET: 15,
  DOT: 16
},

hexDigit = /[0-9a-fA-F]/,
octalDigit = /[0-7]/,
decimalDigit = /[0-9]/,
binaryDigit = /[01]/,

hexDigits = seq(hexDigit, repeat(seq(optional('_'), hexDigit))),
octalDigits = seq(octalDigit, repeat(seq(optional('_'), octalDigit))),
decimalDigits = seq(decimalDigit, repeat(seq(optional('_'), decimalDigit))),
binaryDigits = seq(binaryDigit, repeat(seq(optional('_'), binaryDigit))),

hexLiteral = seq('0', choice('x', 'X'), optional('_'), hexDigits),
octalLiteral = seq('0', optional(choice('o', 'O')), optional('_'), octalDigits),
// allow leading zero, ref: frontends/parsers/p4/p4lexer.ll
decimalLiteral = seq(/[0-9]/, optional(seq(optional('_'), decimalDigits))),
binaryLiteral = seq('0', choice('b', 'B'), optional('_'), binaryDigits),

widthPrefix = seq(repeat1(decimalDigit), choice('w', 's')),

intLiteral = choice(
  binaryLiteral,
  decimalLiteral,
  octalLiteral,
  hexLiteral,
),

widthIntLiteral = seq(
  widthPrefix,
  choice(
    binaryLiteral,
    octalLiteral,
    hexLiteral,
    seq(optional('_'), decimalLiteral)
  )
)

module.exports = grammar({
  name: 'p4',
  rules: {
    extras: $ => [
      /\s|\\\r?\n/,
      $.comment,
    ],

    source_file: $ => repeat($.declaration),

    declaration: $ => choice(
      $.constantDeclaration,
      $.externDeclaration,
      $.actionDeclaration,
      $.parserDeclaration,
      $.typeDeclaration,
      $.controlDeclaration,
      $.instantiation,
      $.errorDeclaration,
      $.matchKindDeclaration,
      $.functionDeclaration
    ),

    _nonTypeName: $ => choice(
      $.identifier,
      $.typeIdentifier,
      $.apply,
      $.state,
      $.type
    ),

    name: $ => choice($._nonTypeName, $.typeIdentifier),

    _nonTableKwName: $ => choice(
      $.identifier,
      $.typeIdentifier,
      $.apply,
      $.state,
      $.type
    ),

    _optAnnotations: $ => optional($._annotations),

    _annotations: $ => repeat1($.annotation),

    annotation: $ => seq(
      '@',
      $.name,
      optional(choice(
        seq('(', $.annotationBody, ')'),
        seq('[', $.structuredAnnotationBody, ']')
      ))
    ),

    parameterList: $ => commaSep($.parameter),

    // _nonEmptyParameterList: $ => choice(
    //   $.parameter,
    //   seq($._nonEmptyParameterList, ',', $.parameter)
    // ),

    parameter: $ => seq(
      $._optAnnotations,
      $.direction,
      $.typeRef,
      $.name,
      optional(seq('=', $.expression))
    ),

    direction: $ => optional(choice(
      $.in,
      $.out,
      $.inout
    )),

    packageTypeDeclaration: $ => choice(
      seq(
        $._optAnnotations,
        $.package,
        $.name,
        $._optTypeParameters,
      ),
      seq('(', $.parameterList, ')')
    ),

    instantiation: $ => choice(
      seq($.typeRef, '(', $.argumentList, ')', $.name, ';'),
      seq($._annotations, $.typeRef, '(', $.argumentList, ')', $.name, ';'),
      seq($._annotations, $.typeRef, '(', $.argumentList, ')',
            $.name, '=', $.objInitializer, ';'),
      seq($.typeRef, '(', $.argumentList, ')', $.name, '=',
            $.objInitializer, ';')
    ),

    objInitializer: $ => seq('{', repeat($.objDeclaration), '}'),
    objDeclaration: $ => choice($.functionDeclaration, $.instantiation),

    optConstructorParameters: $ => choice(seq('(', $.parameterList, ')')),

    dotPrefix: $ => '.',

    /********** PARSER ***********/

    parserDeclaration: $ => seq(
      $.parserTypeDeclaration,
      $.optConstructorParameters,
      '{',
        repeat($.parserLocalElement),
        repeat1($.parserState),
      '}'
    ),

    parserLocalElement: $ => choice(
      $.constantDeclaration,
      $.variableDeclaration,
      $.instantiation,
      $.valueSetDeclaration
    ),

    parserTypeDeclaration: $ => seq(
      $._optAnnotations, $.parser, $.name, $._optTypeParameters,
      '(', $.parameterList, ')'
    ),

    parserState: $ => seq(
      $._optAnnotations, $.state, $.name,
      '{', $._parserStatements, $.transitionStatement, '}'
    ),

    _parserStatements: $ => repeat($.parserStatement),

    parserStatement: $ => choice(
      $.assignmentOrMethodCallStatement,
      $.directApplication,
      $.parserBlockStatement,
      $.constantDeclaration,
      $.variableDeclaration,
      $.emptyStatement,
      $.conditionalStatement
    ),

    parserBlockStatement: $ => seq(
      $._optAnnotations, '{', $._parserStatements, '}'
    ),

    transitionStatement: $ => optional(seq($.transition, $.stateExpression)),

    stateExpression: $ => choice(seq($.name, ';'), $.selectExpression),

    selectExpression: $ => seq($.select, '(', $.expressionList, ')',
      '{', selectCaseList, '}'
    ),

    selectCaseList: $ => repeat($.selectCase),

    selectCase: $ => seq($.keysetExpression, ':', $.name, ';'),

    keysetExpression: $ => choice(
      $.tupleKeysetExpression,
      $.simpleKeysetExpression
    ),

    tupleKeysetExpression: $ => choice(
      seq('(', $.simpleKeysetExpression, ',', $.simpleExpressionList, ')'),
      seq('(', $.reducedSimpleKeysetExpression, ')')
    ),

    simpleExpressionList: $ => commaSep1(simpleKeysetExpression),

    reducedSimpleKeysetExpression: $ => choice(
      req($.expression, '&&&', $.expression),
      req($.expression, '..', $.expression),
      $.default,
      '_'
    ),

    simpleKeysetExpression: $ => choice(
      $.expression,
      $.default,
      $.dontcare,
      req($.expression, $.mask, $.expression),
      req($.expression, $.range, $.expression),
    ),

    valueSetDeclaration: $ => choice(
      seq($._optAnnotations, $.valueset, '<', $.baseType, '>',
        '(', $.expression, ')', $.name, ';'),
      seq($._optAnnotations, $.valueset, '<', $.tupleType, '>',
        '(', $.expression, ')', $.name, ';'),
      seq($._optAnnotations, $.valueset, '<', $.typeName, '>',
        '(', $.expression, ')', $.name, ';')
    ),

    /****************** Control ******************/

    controlDeclaration: $ => seq(
      $.controlTypeDeclaration, $.optConstructorParameters,
      '{', $.controlLocalDeclarations, $.apply, $.controlBody, '}'
    ),

    controlTypeDeclaration: $ => seq(
      $._optAnnotations, $.control, $.name, $._optTypeParameters,
      '(', $.parameterList, ')'
    ),

    controlLocalDeclarations: $ => repeat($.controlLocalDeclaration),

    controlLocalDeclaration: $ => choice(
      $.constantDeclaration,
      $.actionDeclaration,
      $.tableDeclaration,
      $.instantiation,
      $.variableDeclaration
    ),

    controlBody: $ => $.blockStatement,

    /******************** Extern ********************/

    externDeclaration: $ => choice(
      seq($._optAnnotations, $.extern, $._nonTypeName, $._optTypeParameters,
          '{', $._methodPrototypes, '}'),
      seq($._optAnnotations, $.extern, $.functionPrototype, ';')
    ),

    _methodPrototypes: $ => repeat($.methodPrototype),

    functionPrototype: $ => seq(
      $.typeOrVoid, $.name, $._optTypeParameters, '(', $.parameterList, ')'),

    methodPrototype: $ => choice(
      seq($._optAnnotations, $.functionPrototype, ';'),
      seq($._optAnnotations, $.typeIdentifier, '(', $.parameterList, ')', ';'),
    ),

    /************************** TYPES ****************************/

    typeRef: $ => choice(
      $.baseType,
      $.typeName,
      $.specializedType,
      $.headerStackType,
      $.tupleType
    ),

    nameType: $ => choice(
      $.typeName,
      $.specializedType
    ),

    prefixedType: $ => choice(
      $.typeIdentifier,
      seq($.dotPrefix, $.typeIdentifier)
    ),

    typeName: $ => $.prefixedType,

    tupleType: $ => seq($.tuple, '<', $.typeArgumentList, '>'),

    headerStackType: $ => choice(
      seq($.typeName, '[', $.expression, ']'),
      seq($.specializedType, '[', $.expression, ']')
    ),

    specializedType: $ => seq($.prefixedType, '<', $.typeArgumentList, '>'),

    baseType: $ => choice(
      $.bool,
      $.error,
      $.string,
      $.int,
      $.bit,
      seq($.bit, '<', $.integer, '>'),
      seq($.int, '<', $.integer, '>'),
      seq($.varbit, '<', $.integer, '>'),
      seq($.bit, '<', '(', $.expression, ')', '>'),
      seq($.int, '<', '(', $.expression, ')', '>'),
      seq($.varbit, '<', '(', $.expression, ')', '>')
    ),

    typeOrVoid: $ => choice($.typeRef, $.void, $.identifier),

    _optTypeParameters: $ => optional($._typeParameters),

    _typeParameters: $ => seq('<', $._typeParameterList, '>'),

    _typeParameterList: $ => repeat($.name),

    realTypeArg: $ => choice($.dontcare, $.typeRef, $.void),

    typeArg: $ => choice($.dontcare, $.typeRef, $._nonTypeName, $.void),

    realTypeArgumentList: $ => choice($.realTypeArg,
      seq($.realTypeArgumentList, $.comma, $.typeArg)),

    typeArgumentList: $ => commaSep($.typeArg),

    typeDeclaration: $ => choice(
      $.derivedTypeDeclaration,
      $.typedefDeclaration,
      seq($.parserTypeDeclaration, ';'),
      seq($.controlTypeDeclaration, ';'),
      seq($.packageTypeDeclaration, ';')
    ),

    derivedTypeDeclaration: $ => choice(
      $.headerTypeDeclaration,
      $.headerUnionDeclaration,
      $.structTypeDeclaration,
      $.enumDeclaration
    ),

    headerTypeDeclaration: $ => seq(
      $._optAnnotations, $.header, $.name, $._optTypeParameters,
      '{', $._structFieldList, '}'
    ),

    headerUnionDeclaration: $ => seq(
      $._optAnnotations, $.headerUnion, $.name, $._optTypeParameters,
      '{', $._structFieldList, '}'
    ),

    structTypeDeclaration: $ => seq(
      $._optAnnotations, $.struct, $.name, $._optTypeParameters,
      '{', $._structFieldList, '}'
    ),

    _structFieldList: $ => repeat($.structField),

    structField: $ => seq($._optAnnotations, $.typeRef, $.name, ';'),

    enumDeclaration: $ => choice(
      seq($._optAnnotations, $.enum, $.name, '{', $._identifierList, '}'),
      seq($._optAnnotations, $.enum, $.typeRef, $.name,
        '{', $._specifiedIdentifierList, '}'),
    ),

    errorDeclaration: $ => seq($.error, '{', $._identifierList, '}'),

    matchKindDeclaration: $ => seq($.matchKind, '{', $.identifier, '}'),

    _identifierList: $ => commaSep1($.name),

    _specifiedIdentifierList: $ => commaSep1($.specifiedIdentifier),

    specifiedIdentifier: $ => seq($.name, '=', $.initializer),

    typedefDeclaration: $ => choice(
      seq($._optAnnotations, $.typedef, $.typeRef, $.name, ';'),
      seq($._optAnnotations, $.typedef, $.derivedTypeDeclaration, $.name, ';'),
      seq($._optAnnotations, $.type, $.typeRef, $.name, ';'),
      seq($._optAnnotations, $.type, $.derivedTypeDeclaration, $.name, ';')
    ),

    /*************************** STATEMENTS *************************/

    assignmentOrMethodCallStatement: $ => choice(
      seq($.lvalue, '(', $._argumentList, ')', ';'),
      seq($.lvalue, '<', $._typeArgumentList, '>',
        '(', $._argumentList, ')', ';'),
      seq($.lvalue, '=', $.expression, ';')
    ),

    emptyStatement: $ => ';',

    returnStatement: $ => choice(
      seq($.return, ';'),
      seq($.return, $.expression, ';'),
    ),

    exitStatement: $ => seq($.exit, ';'),

    conditionalStatement: $ => choice(
      seq($.if, '(', $.expression, ')', $.statement),
      seq($.if, '(', $.expression, ')', $.statement, $.else, $.statement)
    ),

    directApplication: $ => seq(
      $.typeName, '.', $.apply, '(', argumentList, ')', ';'
    ),

    statement: $ => choice(
      $.assignmentOrMethodCallStatement,
      $.directApplication,
      $.conditionalStatement,
      $.emptyStatement,
      $.blockStatement,
      $.exitStatement,
      $.returnStatement,
      $.switchStatement
    ),

    blockStatement: $ => seq($._optAnnotations, '{', $._statOrDeclList, '}'),

    _statOrDeclList: $ => repeat($.statementOrDeclaration),

    switchStatement: $ => seq($.switch, '(', $.expression, ')',
      '{', $.switchCases, '}'),

    switchCases: $ => repeat($.switchCase),

    switchCase: $ => choice(
      seq($.switchLabel, ':', $.blockStatement),
      seq($.switchLabel, ':')
    ),

    switchLabel: $ => choice(
      $.default,
      $.nonBraceExpression
    ),

    statementOrDeclaration: $ => choice(
      $.variableDeclaration,
      $.constantDeclaration,
      $.statement,
      $.instantiation
    ),

    /********************* Tables *********************/

    tableDeclaration: $ => seq(
      $._optAnnotations, $.table, $.name, '{', $._tablePropertyList, '}'
    ),

    _tablePropertyList: $ => repeat1($.tableProperty),

    tableProperty: $ => choice(
      seq($.key, '=', '{', $._keyElementList, '}'),
      seq($.actions, '=', '{', $._actionList, '}'),
      seq($._optAnnotations, $.const, $.entries, '=', '{', $._entriesList, '}'),
      seq($._optAnnotations, $.const, $._nonTableKwName, '=', $.initializer, ';'),
      seq($._optAnnotations, $._nonTableKwName, '=', $.initializer, ';')
    ),

    _keyElementList: $ => repeat($.keyElement),

    keyElement: $ => seq($.expression, ':', $.name, $._optAnnotations, ';'),

    _actionList: $ => repeat(seq($._optAnnotations, $.actionRef, ';')),

    actionRef: $ => seq(
      $.prefixedNonTypeName,
      optional(seq('(', $.argumentList, ')'))
    ),

    _entriesList: $ => repeat1($.entry),

    entry: $ => seq(
      $.keysetExpression, ':', $.actionRef, $._optAnnotations, ';'
    ),

    /********************* Action *********************/

    actionDeclaration: $ => seq(
      $._optAnnotations, $.action, $.name,
      '(', $.parameterList, ')', $.blockStatement
    ),

    /******************* Variables *******************/

    variableDeclaration: $ => seq(
      $._optAnnotations, $.typeRef, $.name, $._optInitializer, ';'
    ),

    constantDeclaration: $ => seq(
      $._optAnnotations, $.const, $.typeRef, $.name, '=', $.initializer, ';'
    ),

    _optInitializer: $ => optional(seq('=', $.initializer)),

    initializer: $ => $.expression,

    /******************* Expressions *******************/

    functionDeclaration: $ => seq(
      $.functionPrototype, $.blockStatement
    ),

    argumentList: $ => commaSep($.argument),

    argument: $ => choice(
      $.expression,
      seq($.name, '=', $.expression),
      $.dontcare
    ),

    kvList: $ => commaSep1($.kvPair), // at least one kvPair

    kvPair: $ => seq($.name, '=', $.expression),

    expressionList: $ => commaSep($.expression),

    annotationBody: $ => optional(choice(
      seq($.annotationBody, '(', $.annotationBody, ')'),
      seq($.annotationBody, $.annotationToken)
    )),

    structuredAnnotationBody: $ => choice(
      $.expressionList,
      $.kvList
    ),

    annotationToken: $ => choice(
      $.abstract,
      $.action,
      $.actions,
      $.apply,
      $.bool,
      $.bit,
      $.const,
      $.control,
      $.default,
      $.else,
      $.entries,
      $.enum,
      $.error,
      $.exit,
      $.extern,
      $.false,
      $.header,
      $.header_union,
      $.if,
      $.in,
      $.inout,
      $.int,
      $.key,
      $.match_kind,
      $.type,
      $.out,
      $.parser,
      $.package,
      $.pragma,
      $.return,
      $.select,
      $.state,
      $.string,
      $.struct,
      $.switch,
      $.table,
      $.transition,
      $.true,
      $.tuple,
      $.typedef,
      $.varbit,
      $.valueset,
      $.void,
      '_',
      $.identifier,
      $.typeIdentifier,
      $.stringLiteral,
      $.integer,
      '&&&',
      '..',
      '<<',
      '&&',
      '||',
      '==',
      '!=',
      '>=',
      '<=',
      '++',
      '+',
      '|+|',
      '-',
      '|-|',
      '*',
      '/',
      '%',
      '|',
      '&',
      '^',
      '~',
      '[',
      ']',
      '{',
      '}',
      '<',
      '>',
      '!',
      ':',
      ',',
      '?',
      '.',
      '=',
      ';',
      '@',
      $.unknownToken
    ),

    member: $ => $.name,

    prefixedNonTypeName: $ => choice(
      $._nonTypeName,
      seq($.dotPrefix, $._nonTypeName)
    ),

    lvalue: $ => choice(
      $.prefixedNonTypeName,
      $.this,
      seq($.lvalue, '.', $.memeber),
      seq($.lvalue, '[', $.expression, ']'),
      seq($.lvalue, '[', $.expression, ':', $.expression, ']')
    ),

    // TODO: add precedences

    expression: $ => choice(
      $.integer,
      $.true,
      $.false,
      $.this,
      $.stringLiteral,
      $._nonTypeName,
      seq($.dotPrefix, $._nonTypeName),
      prec(PREC.BRACKET,seq($.expression, '[', $.expression, ']')),
      prec(PREC.BRACKET,
        seq($.expression, '[', $.expression, ':', $.expression, ']')),
      seq('{', $.expressionList, '}'),
      seq('{', $.kvList, '}'),
      seq('(', $.expression, ')'),
      $.unaryExpression,
      $.memberExpression,
      $.binaryExpression,

      prec(PREC.QUESTION, seq($.expression, '?',
        prec(PREC.COLON, seq(':', $.expression)))),
      
      seq($.expression, '<', $.realTypeArgumentList, '>',
        '(', $.argumentList, ')'),
      seq($.expression, '(', $.argumentList, ')'),
      seq($.nameType, '(', $.argumentList, ')'),
      seq('(', $.typeRef, ')', $.expression)
    ),

    unaryExpression: $ => prec.left(PREC.UNARY, seq(
      field('operator', choice('!', '~', '-', '+')),
      field('argument', $.expression)
    )),

    memberExpression: $ => prec.left(PREC.DOT, seq(
      choice($.typeName, $.error, $.expression),
      '.',
      $.member
    )),

    binaryExpression: $ => {
      const table = [
        ['*', PREC.MULTI],
        ['/', PREC.MULTI],
        ['%', PREC.MULTI],
        ['+', PREC.ADD],
        ['-', PREC.ADD],
        ['|+|', PREC.ADD],
        ['|-|', PREC.ADD],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
        ['<=', PREC.CMP],
        ['>=', PREC.CMP],
        ['<', PREC.CMP],
        ['>', PREC.CMP],
        ['!=', PREC.EQ],
        ['==', PREC.EQ],
        ['&', PREC.AND],
        ['^', PREC.XOR],
        ['|', PREC.OR],
        ['++', PREC.ADD],
        ['&&', PREC.LAND],
        ['||', PREC.LOR],
      ];

      return choice(...table.map(([operator, precedence]) => prec.left(precedence,
        seq(field('left', $.expression),
            field('operator', operator),
            field('right', $.expression))
      )));

    },


    nonBraceExpression: $ => choice(
      $.integer,
      $.true,
      $.false,
      $.this,
      $.stringLiteral,
      $._nonTypeName,
      seq($.dotPrefix, $._nonTypeName),
      prec(PREC.BRACKET,seq($.nonBraceExpression, '[', $.expression, ']')),
      prec(PREC.BRACKET,
        seq($.nonBraceExpression, '[', $.expression, ':', $.expression, ']')),
      seq('(', $.expression, ')'),
      $.unaryExpression,
      $.memberNonBraceExpression,
      $.binaryNonBraceExpression,

      prec(PREC.QUESTION, seq($.nonBraceExpression, '?',
        prec(PREC.COLON, seq(':', $.expression)))),
      
      seq($.nonBraceExpression, '<', $.realTypeArgumentList, '>',
        '(', $.argumentList, ')'),
      seq($.nonBraceExpression, '(', $.argumentList, ')'),
      seq($.nameType, '(', $.argumentList, ')'),
      seq('(', $.typeRef, ')', $.expression)
    ),


    memberNonBraceExpression: $ => prec.left(PREC.DOT, seq(
      choice($.typeName, $.error, $.nonBraceExpression),
      '.',
      $.member
    )),

    binaryNonBraceExpression: $ => {
      const table = [
        ['*', PREC.MULTI],
        ['/', PREC.MULTI],
        ['%', PREC.MULTI],
        ['+', PREC.ADD],
        ['-', PREC.ADD],
        ['|+|', PREC.ADD],
        ['|-|', PREC.ADD],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
        ['<=', PREC.CMP],
        ['>=', PREC.CMP],
        ['<', PREC.CMP],
        ['>', PREC.CMP],
        ['!=', PREC.EQ],
        ['==', PREC.EQ],
        ['&', PREC.AND],
        ['^', PREC.XOR],
        ['|', PREC.OR],
        ['++', PREC.ADD],
        ['&&', PREC.LAND],
        ['||', PREC.LOR],
      ];

      return choice(...table.map(([operator, precedence]) => prec.left(precedence,
        seq(field('left', $.nonBraceExpression),
            field('operator', operator),
            field('right', $.expression))
      )));

    },

    /****************** Token ******************/

    abstract: $ => token('abstract'),
    action: $ => token('action'),
    actions: $ => token('actions'),
    apply: $ => token('apply'),
    bit: $ => token('bit'),
    bool: $ => token('bool'),
    const: $ => token('const'),
    control: $ => token('control'),
    default: $ => token('default'),
    else: $ => token('else'),
    entries: $ => token('entries'),
    enum: $ => token('enum'),
    error: $ => token('error'),
    exit: $ => token('exit'),
    extern: $ => token('extern'),
    false: $ => token('false'),
    header_union: $ => token('header_union'),
    header: $ => token('header'),
    if: $ => token('if'),
    in: $ => token('in'),
    inout: $ => token('inout'),
    int: $ => token('int'),
    key: $ => token('key'),
    match_kind: $ => token('match_kind'),
    type: $ => token('type'),
    out: $ => token('out'),
    package: $ => token('package'),
    parser: $ => token('parser'),
    return: $ => token('return'),
    select: $ => token('select'),
    state: $ => token('state'),
    string: $ => token('string'),
    struct: $ => token('struct'),
    switch: $ => token('switch'),
    table: $ => token('table'),
    this: $ => token('this'),
    transition: $ => token('transition'),
    true: $ => token('true'),
    tuple: $ => token('tuple'),
    typedef: $ => token('typedef'),
    varbit: $ => token('varbit'),
    valueset: $ => token('value_set'),
    // verify: $ => token('verify'),
    void: $ => token('void'),
    dontcare: $ => token('_'),
    
    // Ref tree-sitter-go
    integer: $ => token(choice(intLiteral, widthIntLiteral)),
    comment: $ => token(choice(
      seq('//', /.*/),
      seq(
        '/*',
        /[^*]*\*+([^/*][^*]*\*+)*/,
        '/'
      )
    )),

    // Ref tree-sitter-c
    identifier: $ => /[a-zA-Z_]\w*/,

  }
})


// optional list of rule, seperated by comma
function commaSep (rule) {
  return optional(commaSep1(rule))
}

function commaSep1 (rule) {
  return seq(rule, repeat(seq(',', rule)))
}

function commaSepTrailing (recurSymbol, rule) {
  return choice(rule, seq(recurSymbol, ',', rule))
}
