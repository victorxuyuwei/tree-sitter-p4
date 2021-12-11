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

  extras: $ => [
    /\s|\\\r?\n/,
    $.comment,
  ],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.unaryExpression, $.typeArgFunctionCall, $.binaryExpression],
    [$.typeArgFunctionCall, $.binaryExpression],
    [$.castExpression, $.typeArgFunctionCall, $.binaryExpression],
    [$.typeArgFunctionCall, $.binaryExpression, $.binaryNonBraceExpression],
  ],

  rules: {
    source_file: $ => repeat($._declaration),

    _declaration: $ => choice(
      $.constantDeclaration,
      $.externDeclaration,
      $.actionDeclaration,
      $.parserDeclaration,
      $._typeDeclaration,
      $.controlDeclaration,
      $.instantiation,
      $.errorDeclaration,
      $.matchKindDeclaration,
      $.functionDeclaration,

      // preproc
      $.preproc_if,
      $.preproc_ifdef,
      $.preproc_include,
      $.preproc_def,
      $.preproc_function_def,
      $.preproc_call
    ),

    /**************** Preprocess ******************/
    // Preprocesser

    preproc_include: $ => seq(
      preprocessor('include'),
      field('path', choice(
        $.stringLiteral,
        $.systemLibString,
        $.identifier,
        // alias($.preproc_call_expression, $.call_expression),
      )),
      '\n'
    ),

    preproc_def: $ => seq(
      preprocessor('define'),
      field('name', $.identifier),
      field('value', optional($.preproc_arg)),
      '\n'
    ),

    preproc_function_def: $ => seq(
      preprocessor('define'),
      field('name', $.identifier),
      field('parameters', $.preproc_params),
      field('value', optional($.preproc_arg)),
      '\n'
    ),

    preproc_params: $ => seq(
      token.immediate('('), commaSep(choice($.identifier, '...')), ')'
    ),

    preproc_call: $ => seq(
      field('directive', $.preproc_directive),
      field('argument', optional($.preproc_arg)),
      '\n'
    ),

    ...preprocIf('', $ => $._declaration),
    // ...preprocIf('_in_field_declaration_list', $ => $._field_declaration_list_item),

    preproc_directive: $ => /#[ \t]*[a-zA-Z]\w*/,
    preproc_arg: $ => token(prec(-1, repeat1(/.|\\\r?\n/))),

    _preproc_expression: $ => choice(
      $.identifier,
      alias($.preproc_call_expression, $.call_expression),
      $.integer,
      // $.char_literal,
      $.preproc_defined,
      alias($.preproc_unary_expression, $.unary_expression),
      alias($.preproc_binary_expression, $.binary_expression),
      // alias($.preproc_parenthesized_expression, $.parenthesized_expression)
    ),

    preproc_parenthesized_expression: $ => seq(
      '(',
      $._preproc_expression,
      ')'
    ),

    preproc_defined: $ => choice(
      prec(PREC.BRACKET, seq('defined', '(', $.identifier, ')')),
      seq('defined', $.identifier),
    ),

    preproc_unary_expression: $ => prec.left(PREC.UNARY, seq(
      field('operator', choice('!', '~', '-', '+')),
      field('argument', $._preproc_expression)
    )),

    preproc_call_expression: $ => prec(PREC.BRACKET, seq(
      field('function', $.identifier),
      field('arguments', alias($.preproc_argument_list, $.argument_list))
    )),

    preproc_argument_list: $ => seq(
      '(',
      commaSep($._preproc_expression),
      ')'
    ),

    preproc_binary_expression: $ => {
      const table = [
        // ['+', PREC.ADD],
        // ['-', PREC.ADD],
        // ['*', PREC.MULTIPLY],
        // ['/', PREC.MULTIPLY],
        // ['%', PREC.MULTIPLY],
        ['||', PREC.LOR],
        ['&&', PREC.LAND],
        // ['|', PREC.INCLUSIVE_OR],
        // ['^', PREC.EXCLUSIVE_OR],
        // ['&', PREC.BITWISE_AND],
        ['==', PREC.EQ],
        ['!=', PREC.EQ],
        ['>', PREC.CMP],
        ['>=', PREC.CMP],
        ['<=', PREC.CMP],
        ['<', PREC.CMP],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
      ];

      return choice(...table.map(([operator, precedence]) => {
        return prec.left(precedence, seq(
          field('left', $._preproc_expression),
          field('operator', operator),
          field('right', $._preproc_expression)
        ))
      }));
    },

    /**************** Main grammar ****************/

    _nonTypeName: $ => prec(1, choice(
      $.identifier,
      $.apply,
      $.key,
      $.actions,
      $.state,
      $.entries,
      $.type
    )),

    name: $ => choice($._nonTypeName, $._typeIdentifier),

    _nonTableKwName: $ => choice(
      $.identifier,
      $._typeIdentifier,
      $.apply,
      $.state,
      $.type
    ),

    // Use repeat($.annotation)
    // _optAnnotations: $ => optional($._annotations),

    // _annotations: $ => repeat1($.annotation),



    annotation: $ => seq(
      '@',
      $.name,
      optional(choice(
        seq('(', optional($.annotationBody), ')'),
        seq('[', $.structuredAnnotationBody, ']')
      ))
    ),

    parameterList: $ => seq('(', commaSep($.parameter), ')'),

    // _nonEmptyParameterList: $ => choice(
    //   $.parameter,
    //   seq($._nonEmptyParameterList, ',', $.parameter)
    // ),

    parameter: $ => seq(
      repeat($.annotation),
      optional($.direction),
      $.typeRef,
      $.name,
      optional(seq('=', $._expression))
    ),

    direction: $ => choice(
      $.in,
      $.out,
      $.inout
    ),

    packageTypeDeclaration: $ => seq(
        repeat($.annotation),
        $.package,
        $.name,
        optional($._typeParameters),
        $.parameterList
    ),

    instantiation: $ => choice(
      seq($.typeRef, $.argumentList, $.name, ';'),
      seq(repeat1($.annotation), $.typeRef, $.argumentList, $.name, ';'),
      seq(repeat1($.annotation), $.typeRef, $.argumentList,
            $.name, '=', $.objInitializer, ';'),
      seq($.typeRef, $.argumentList, $.name, '=',
            $.objInitializer, ';')
    ),

    objInitializer: $ => seq('{', repeat($.objDeclaration), '}'),
    objDeclaration: $ => choice($.functionDeclaration, $.instantiation),


    dotPrefix: $ => '.',

    /********** PARSER ***********/

    parserDeclaration: $ => seq(
      $.parserTypeDeclaration,
      optional($.parameterList),
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
      repeat($.annotation), $.parser, $.name, optional($._typeParameters),
      $.parameterList
    ),

    parserState: $ => seq(
      repeat($.annotation), $.state, $.name,
      '{', repeat($.parserStatement), optional($._transitionStatement), '}'
    ),

    // _parserStatements: $ => repeat($.parserStatement),

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
      repeat($.annotation), '{', repeat($.parserStatement), '}'
    ),

    _transitionStatement: $ => seq($.transition, $.stateExpression),

    stateExpression: $ => choice(seq($.name, ';'), $.selectExpression),

    selectExpression: $ => seq($.select, '(', commaSep($._expression), ')',
      '{', repeat($.selectCase), '}'
    ),

    selectCase: $ => seq($.keysetExpression, ':', $.name, ';'),

    keysetExpression: $ => choice(
      $.tupleKeysetExpression,
      $.simpleKeysetExpression
    ),

    tupleKeysetExpression: $ => choice(
      seq('(', $.simpleKeysetExpression, ',', $.simpleExpressionList, ')'),
      seq('(', $.reducedSimpleKeysetExpression, ')')
    ),

    simpleExpressionList: $ => commaSep1($.simpleKeysetExpression),

    reducedSimpleKeysetExpression: $ => choice(
      seq($._expression, $.mask, $._expression),
      seq($._expression, $.range, $._expression),
      $.default,
      $.dontcare
    ),

    simpleKeysetExpression: $ => choice(
      $._expression,
      $.default,
      $.dontcare,
      seq($._expression, $.mask, $._expression),
      seq($._expression, $.range, $._expression),
    ),

    valueSetDeclaration: $ => choice(
      seq(repeat($.annotation), $.valueset, '<', $.baseType, '>',
        '(', $._expression, ')', $.name, ';'),
      seq(repeat($.annotation), $.valueset, '<', $.tupleType, '>',
        '(', $._expression, ')', $.name, ';'),
      seq(repeat($.annotation), $.valueset, '<', $.typeName, '>',
        '(', $._expression, ')', $.name, ';')
    ),

    /****************** Control ******************/

    controlDeclaration: $ => seq(
      $.controlTypeDeclaration, optional($.parameterList),
      '{', repeat($.controlLocalDeclaration), $.apply, $.controlBody, '}'
    ),

    controlTypeDeclaration: $ => seq(
      repeat($.annotation), $.control, $.name, optional($._typeParameters),
      $.parameterList
    ),

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
      seq(repeat($.annotation), $.extern, $._nonTypeName, optional($._typeParameters),
          '{', repeat($.methodPrototype), '}'),
      seq(repeat($.annotation), $.extern, $.functionPrototype, ';')
    ),

    functionPrototype: $ => seq(
      $.typeOrVoid, $.name, optional($._typeParameters), $.parameterList),

    methodPrototype: $ => choice(
      seq(repeat($.annotation), $.functionPrototype, ';'),
      seq(repeat($.annotation), $._typeIdentifier, $.parameterList, ';'),
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
      $._typeIdentifier,
      seq($.dotPrefix, $._typeIdentifier)
    ),

    typeName: $ => $.prefixedType,

    tupleType: $ => seq($.tuple, $.typeArgumentList),

    headerStackType: $ => choice(
      seq($.typeName, '[', $._expression, ']'),
      seq($.specializedType, '[', $._expression, ']')
    ),

    specializedType: $ => seq($.prefixedType, $.typeArgumentList),

    baseType: $ => choice(
      $.bool,
      $.error,
      $.string,
      $.int,
      $.bit,
      seq($.bit, '<', $.integer, '>'),
      seq($.int, '<', $.integer, '>'),
      seq($.varbit, '<', $.integer, '>'),
      seq($.bit, '<', '(', $._expression, ')', '>'),
      seq($.int, '<', '(', $._expression, ')', '>'),
      seq($.varbit, '<', '(', $._expression, ')', '>')
    ),

    typeOrVoid: $ => prec(1,choice($.typeRef, $.void, $.identifier)),

    _typeParameters: $ => seq('<', repeat($.name), '>'),

    realTypeArg: $ => choice($.dontcare, $.typeRef, $.void),

    typeArg: $ => choice($.dontcare, $.typeRef, $._nonTypeName, $.void),

    realTypeArgumentList: $ => seq($.realTypeArg,
      repeat(seq($.comma, $.typeArg))),

    typeArgumentList: $ => seq('<', commaSep($.typeArg), '>'),

    _typeDeclaration: $ => choice(
      $._derivedTypeDeclaration,
      $.typedefDeclaration,
      seq($.parserTypeDeclaration, ';'),
      seq($.controlTypeDeclaration, ';'),
      seq($.packageTypeDeclaration, ';')
    ),

    _derivedTypeDeclaration: $ => choice(
      $.headerTypeDeclaration,
      $.headerUnionDeclaration,
      $.structTypeDeclaration,
      $.enumDeclaration
    ),

    headerTypeDeclaration: $ => seq(
      repeat($.annotation), $.header, $.name, optional($._typeParameters),
      $._structFieldBlock
    ),

    headerUnionDeclaration: $ => seq(
      repeat($.annotation), $.headerUnion, $.name, optional($._typeParameters),
      $._structFieldBlock
    ),

    structTypeDeclaration: $ => seq(
      repeat($.annotation), $.struct, $.name, optional($._typeParameters),
      $._structFieldBlock
    ),

    _structFieldBlock: $ => seq('{', repeat($.structField), '}'),

    structField: $ => seq(repeat($.annotation), $.typeRef, $.name, ';'),

    enumDeclaration: $ => choice(
      seq(repeat($.annotation), $.enum, $.name, '{', $._identifierList, '}'),
      seq(repeat($.annotation), $.enum, $.typeRef, $.name,
        '{', $._specifiedIdentifierList, '}'),
    ),

    errorDeclaration: $ => seq($.error, '{', $._identifierList, '}'),

    matchKindDeclaration: $ => seq($.matchKind, '{', $.identifier, '}'),

    _identifierList: $ => commaSep1($.name),

    _specifiedIdentifierList: $ => commaSep1($.specifiedIdentifier),

    specifiedIdentifier: $ => seq($.name, '=', $.initializer),

    typedefDeclaration: $ => choice(
      seq(repeat($.annotation), $.typedef, $.typeRef, $.name, ';'),
      seq(repeat($.annotation), $.typedef, $._derivedTypeDeclaration, $.name, ';'),
      seq(repeat($.annotation), $.type, $.typeRef, $.name, ';'),
      seq(repeat($.annotation), $.type, $._derivedTypeDeclaration, $.name, ';')
    ),

    /*************************** STATEMENTS *************************/

    assignmentOrMethodCallStatement: $ => choice(
      seq($.lvalue, $.argumentList, ';'),
      seq($.lvalue, $.typeArgumentList,
        $.argumentList, ';'),
      seq($.lvalue, '=', $._expression, ';')
    ),

    emptyStatement: $ => ';',

    returnStatement: $ => choice(
      seq($.return, ';'),
      seq($.return, $._expression, ';'),
    ),

    exitStatement: $ => seq($.exit, ';'),

    conditionalStatement: $ => prec.right(seq(
      $.if, '(', $._expression, ')', 
        $.statement, 
      optional(seq($.else, 
        $.statement)))),
  

    directApplication: $ => seq(
      $.typeName, '.', $.apply, $.argumentList, ';'
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

    blockStatement: $ => seq(repeat($.annotation), $._statOrDeclList),

    _statOrDeclList: $ => seq('{', repeat($.statementOrDeclaration), '}'),

    switchStatement: $ => seq($.switch, '(', $._expression, ')',
      $.switchBlock),

    switchBlock: $ => seq('{', repeat($.switchCase), '}'),

    switchCase: $ => choice(
      seq($.switchLabel, ':', $.blockStatement),
      seq($.switchLabel, ':')
    ),

    switchLabel: $ => choice(
      $.default,
      $._nonBraceExpression
    ),

    statementOrDeclaration: $ => choice(
      $.variableDeclaration,
      $.constantDeclaration,
      $.statement,
      $.instantiation
    ),

    /********************* Tables *********************/

    tableDeclaration: $ => seq(
      repeat($.annotation), $.table, $.name, $._tablePropertyBlock,
    ),

    _tablePropertyBlock: $ => seq('{', repeat1($.tableProperty), '}'),

    tableProperty: $ => choice(
      seq($.key, '=', $._keyElementBlock),
      seq($.actions, '=', $._actionBlock),
      seq(repeat($.annotation), $.const, $.entries, '=', $._entriesBlock),
      seq(repeat($.annotation), $.const, $._nonTableKwName, '=', $.initializer, ';'),
      seq(repeat($.annotation), $._nonTableKwName, '=', $.initializer, ';')
    ),

    _keyElementBlock: $ => seq('{', repeat($.keyElement), '}'),

    keyElement: $ => seq($._expression, ':', $.name, repeat($.annotation), ';'),

    _actionBlock: $ => seq(
      '{', 
        repeat(seq(repeat($.annotation), $.actionRef, ';')),
      '}'
    ),

    actionRef: $ => seq(
      $.prefixedNonTypeName,
      optional($.argumentList)
    ),

    _entriesBlock: $ => seq('{', repeat1($.entry), '}'),

    entry: $ => seq(
      $.keysetExpression, ':', $.actionRef, repeat($.annotation), ';'
    ),

    /********************* Action *********************/

    actionDeclaration: $ => seq(
      repeat($.annotation), $.action, $.name,
      $.parameterList, $.blockStatement
    ),

    /******************* Variables *******************/

    variableDeclaration: $ => seq(
      repeat($.annotation), $.typeRef, $.name, 
        optional(seq('=', $.initializer)), ';'
    ),

    constantDeclaration: $ => seq(
      repeat($.annotation), $.const, $.typeRef, $.name, '=', $.initializer, ';'
    ),

    initializer: $ => $._expression,

    /******************* Expressions *******************/

    functionDeclaration: $ => seq(
      $.functionPrototype, $.blockStatement
    ),

    argumentList: $ => seq('(', commaSep($.argument), ')'),

    argument: $ => choice(
      $._expression,
      seq($.name, '=', $._expression),
      $.dontcare
    ),

    kvList: $ => commaSep1($.kvPair), // at least one kvPair

    kvPair: $ => seq($.name, '=', $._expression),

    // expressionList: $ => commaSep($._expression),

    annotationBody: $ => choice(
      seq(optional($.annotationBody), '(', optional($.annotationBody), ')'),
      seq(optional($.annotationBody), $.annotationToken)
    ),

    structuredAnnotationBody: $ => choice(
      commaSep1($._expression),
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
      $.headerUnion,
      $.if,
      $.in,
      $.inout,
      $.int,
      $.key,
      $.matchKind,
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
      $._typeIdentifier,
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
      // $.unknownToken
    ),

    member: $ => $.name,

    prefixedNonTypeName: $ => choice(
      $._nonTypeName,
      seq($.dotPrefix, $._nonTypeName)
    ),

    lvalue: $ => choice(
      $.prefixedNonTypeName,
      $.this,
      seq($.lvalue, '.', $.member),
      seq($.lvalue, '[', $._expression, ']'),
      seq($.lvalue, '[', $._expression, ':', $._expression, ']')
    ),

    // TODO: add precedences

    _expression: $ => choice(
      $.integer,
      $.true,
      $.false,
      $.this,
      $.stringLiteral,
      $._nonTypeName,
      seq($.dotPrefix, $._nonTypeName),
      prec(PREC.BRACKET,seq($._expression, '[', $._expression, ']')),
      prec(PREC.BRACKET,
        seq($._expression, '[', $._expression, ':', $._expression, ']')),
      seq('{', commaSep($._expression), '}'),
      seq('{', $.kvList, '}'),
      seq('(', $._expression, ')'),
      $.unaryExpression,
      $.memberExpression,
      $.binaryExpression,

      prec(PREC.QUESTION, seq($._expression, '?',
        prec(PREC.COLON, seq(':', $._expression)))),
      
      $.typeArgFunctionCall,

      seq($._expression, $.argumentList),
      seq($.nameType, $.argumentList),
      $.castExpression
    ),


    castExpression: $ => prec(PREC.UNARY, 
      seq('(', $.typeRef, ')', $._expression)),

    unaryExpression: $ => prec.left(PREC.UNARY, seq(
      field('operator', choice('!', '~', '-', '+')),
      field('argument', $._expression)
    )),

    memberExpression: $ => prec.left(PREC.DOT, seq(
      choice($.typeName, $.error, $._expression),
      '.',
      $.member
    )),

    typeArgFunctionCall: $ => prec.left(PREC.BRACKET,
      seq($._expression, '<', $.realTypeArgumentList, '>', $.argumentList)),

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
        seq(field('left', $._expression),
            field('operator', operator),
            field('right', $._expression))
      )));

    },


    _nonBraceExpression: $ => choice(
      $.integer,
      $.true,
      $.false,
      $.this,
      $.stringLiteral,
      $._nonTypeName,
      seq($.dotPrefix, $._nonTypeName),
      prec(PREC.BRACKET,seq($._nonBraceExpression, '[', $._expression, ']')),
      prec(PREC.BRACKET,
        seq($._nonBraceExpression, '[', $._expression, ':', $._expression, ']')),
      seq('(', $._expression, ')'),
      $.unaryExpression,
      $.memberNonBraceExpression,
      $.binaryNonBraceExpression,

      prec(PREC.QUESTION, seq($._nonBraceExpression, '?',
        prec(PREC.COLON, seq(':', $._expression)))),
      
      // seq($._nonBraceExpression, '<', $.realTypeArgumentList, '>',
      //   $.argumentList),
      $.typeArgNonBraceFunctionCall,
      seq($._nonBraceExpression, $.argumentList),
      seq($.nameType, $.argumentList),
      $.castExpression,
    ),

    typeArgNonBraceFunctionCall: $ => prec.left(PREC.BRACKET,
      seq($._nonBraceExpression, '<', $.realTypeArgumentList, '>', $.argumentList)),

    memberNonBraceExpression: $ => prec.left(PREC.DOT, seq(
      choice($.typeName, $.error, $._nonBraceExpression),
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
        seq(field('left', $._nonBraceExpression),
            field('operator', operator),
            field('right', $._expression))
      )));

    },

    /****************** Token ******************/

    pragma: $ => token('@pragma'),
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
    headerUnion: $ => token('header_union'),
    header: $ => token('header'),
    if: $ => token('if'),
    in: $ => token('in'),
    inout: $ => token('inout'),
    int: $ => token('int'),
    key: $ => token('key'),
    matchKind: $ => token('match_kind'),
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

    // currently I can't distinguish between them with tree-sitter. set -1
    _typeIdentifier: $ => prec(-1, alias($.identifier, $.typeIdentifier)),

    stringLiteral: $ => seq(
      '"',
      optional(
        token.immediate(prec(1, /[^"\n]+/)),
      ),
      '"',
    ),

    systemLibString: $ => token(seq(
      '<',
      repeat(choice(/[^>\n]/, '\\>')),
      '>'
    )),

    mask: $ => '&&&',
    range: $ => '..',
    comma: $ => ','

  }
})

function preprocIf (suffix, content) {
  function elseBlock ($) {
    return choice(
      suffix ? alias($['preproc_else' + suffix], $.preproc_else) : $.preproc_else,
      suffix ? alias($['preproc_elif' + suffix], $.preproc_elif) : $.preproc_elif,
    );
  }

  return {
    ['preproc_if' + suffix]: $ => seq(
      preprocessor('if'),
      field('condition', $._preproc_expression),
      '\n',
      repeat(content($)),
      field('alternative', optional(elseBlock($))),
      preprocessor('endif')
    ),

    ['preproc_ifdef' + suffix]: $ => seq(
      choice(preprocessor('ifdef'), preprocessor('ifndef')),
      field('name', $.identifier),
      repeat(content($)),
      field('alternative', optional(elseBlock($))),
      preprocessor('endif')
    ),

    ['preproc_else' + suffix]: $ => seq(
      preprocessor('else'),
      repeat(content($))
    ),

    ['preproc_elif' + suffix]: $ => seq(
      preprocessor('elif'),
      field('condition', $._preproc_expression),
      '\n',
      repeat(content($)),
      field('alternative', optional(elseBlock($))),
    )
  }
}

function preprocessor (command) {
  return alias(new RegExp('#[ \t]*' + command), '#' + command)
}

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
