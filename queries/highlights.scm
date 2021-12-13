[
  (action)
  (actions)
  (apply)
  (control)
  (const)
  (default)
  (else)
  (extern)
  (exit)
  (header)
  (if)
  (package)
  (parser)
  (return)
  (select)
  (struct)
  (state)
  (switch)
  (table)
  (transition)
  (typedef)
] @keyword



[
  "="
  ">"
  "<"
  "!"
  "~"
  "?"
  ":"
  "=="
  "<="
  ">="
  "!="
  "&&"
  "||"
  "++"
  "+"
  "-"
  "*"
  "/"
  "&"
  "|"
  "^"
  "%"
  "<<"
  ">>"
  "&&&"
  ".."
] @operator



[
  (true)
  (false)
] @constant.builtin

(comment) @comment


"#define" @keyword
"#elif" @keyword
"#else" @keyword
"#endif" @keyword
"#if" @keyword
"#ifdef" @keyword
"#ifndef" @keyword
"#include" @keyword

(integer) @number
(typeRef) @type
(direction) @property
(parameter (name) @variable.parameter) 


(identifier) @variable