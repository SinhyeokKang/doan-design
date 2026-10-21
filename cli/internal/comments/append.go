package comments

import (
	"errors"
	"io"
	"os"
)

func Append(path string, data []byte) (err error) {
	if len(data) == 0 {
		return nil
	}
	f, err := os.OpenFile(path, os.O_RDWR|os.O_APPEND, 0)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, f.Close()) }()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if st.Size() > 0 {
		var last [1]byte
		if _, err = f.ReadAt(last[:], st.Size()-1); err != nil {
			return err
		}
		if last[0] != '\n' {
			data = append([]byte{'\n'}, data...)
		}
	}
	n, err := f.Write(data)
	if err == nil && n != len(data) {
		return io.ErrShortWrite
	}
	return err
}
