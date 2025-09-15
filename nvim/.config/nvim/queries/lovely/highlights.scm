(int_literal) @number
(comment) @comment
(variable_ident) @variable
(type) @type
; (path_separator) @punctuation

":" @punctuation
"=" @punctuation
"~" @punctuation
; "#" @punctuation
"/" @punctuation ; TODO
"," @punctuation.delimiter
"{" @punctuation.bracket
"}" @punctuation.bracket
"(" @punctuation.bracket
")" @punctuation.bracket

"^" @operator
"*" @operator
; "/" @operator
"+" @operator
"-" @operator
"<" @operator
">" @operator
"<=" @operator
">=" @operator
"==" @operator
"!=" @operator
"!" @operator

; "use" @keyword
"fun" @keyword
