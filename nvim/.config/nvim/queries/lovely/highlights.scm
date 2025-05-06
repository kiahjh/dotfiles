; literals
(int_literal) @number

; keywords
"fun" @keyword
(unit) @keyword

; punctuation
";" @punctuation
":" @punctuation
"{" @punctuation.bracket
"}" @punctuation.bracket
"(" @punctuation.bracket
")" @punctuation.bracket
"," @punctuation.delimiter

; operators
"+" @operator
"-" @operator
"*" @operator
"/" @operator
"^" @operator
">" @operator
"<" @operator
"==" @operator
"!=" @operator
">=" @operator
"<=" @operator

; misc.
(comment) @comment
(type) @type
(variable_ident) @variable
